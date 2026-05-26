/* =========================================================
 * Les fantômes d'Ombrequatre — Optimal Solver  (A* + MST PDB)
 *
 * ALGORITHME : A* sur (row, col, last_dir, coin_mask)
 * -------------------------------------------------------
 * Remplacement du BFS naïf par A* avec heuristique admissible :
 *
 *   h(mask) = poids MST des gems restants
 *
 * La matrice de distances préprogrammées g_pdist[i][j] donne le
 * nombre de slides minimum depuis la position de repos du gem i
 * pour collecter le gem j (BFS léger mono-gem, O(H×W×5) par gem).
 *
 * La Pattern Database g_pdb[mask] stocke le poids MST de chaque
 * sous-ensemble de gems (2^n entrées, ~4 Mo pour n=20). Calcul
 * par algorithme de Prim, O(n²) par masque. Durée : <1s pour n=20.
 *
 * GAIN vs BFS
 * -----------
 * BFS explore ~H×W×5×2^n états dans le pire cas.
 * Pour level10 : 15×15×5×2^20 ≈ 1,17 milliard → hors limite.
 * A* n'explore que les états f = g+h ≤ coût optimal.
 * Avec une heuristique serrée, cela réduit de 2-3 ordres de
 * grandeur en pratique, rendant le level10 (20 gems) soluble.
 *
 * Toutes les fonctions de parsing, slide et fantômes restent
 * identiques à l'original.
 * ========================================================= */

#include "solver.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>
#include <limits.h>

/* ---- Directions ---- */
static const int DR[4] = { -1, +1,  0,  0 };
static const int DC[4] = {  0,  0, -1, +1 };
static const kl_dir_t OPP_DIR[5] = {
    KL_DIR_D, KL_DIR_U, KL_DIR_R, KL_DIR_L, KL_DIR_NONE
};
static const char *DIR_NAME[5] = { "UP", "DOWN", "LEFT", "RIGHT", "NONE" };

const char *kl_dir_name(kl_dir_t d) {
    return (d > KL_DIR_NONE) ? "?" : DIR_NAME[d];
}

/* ================================================================
 * PARSING (identique à l'original)
 * ================================================================ */

static bool is_walkable_char(char c) {
    return c == KL_GEM || c == KL_POTION || c == KL_WATCH ||
           c == KL_PORTAL || c == KL_EMPTY;
}

bool kl_parse_level_file(const char *path, kl_level_t *lvl,
                         char *err, size_t err_sz)
{
    FILE *f = fopen(path, "r");
    if (!f) {
        snprintf(err, err_sz, "Cannot open '%s': %s", path, strerror(errno));
        return false;
    }
    memset(lvl, 0, sizeof(*lvl));
    lvl->start_row = -1;
    lvl->ghost_red_r = lvl->ghost_red_c = -1;
    lvl->ghost_green_r = lvl->ghost_green_c = -1;
    lvl->ghost_yellow_r = lvl->ghost_yellow_c = -1;
    lvl->ghost_blue_r = lvl->ghost_blue_c = -1;
    for (int r = 0; r < KL_MAX_H; r++)
        for (int c = 0; c < KL_MAX_W; c++)
            lvl->coin_index[r][c] = -1;

    char line[512]; bool in_map = false; int map_row = 0;
    while (fgets(line, sizeof(line), f)) {
        size_t L = strlen(line);
        while (L > 0 && (line[L-1]=='\n'||line[L-1]=='\r')) line[--L]='\0';
        if (!in_map) {
            if (strcmp(line,"MAP")==0) { in_map=true; continue; }
            int v1,v2; char key;
            if (sscanf(line,"%c %d %d",&key,&v1,&v2)>=2) {
                switch(key) {
                    case 'W': lvl->w=v1; break;
                    case 'H': lvl->h=v1; break;
                    case 'P': lvl->start_row=v1; lvl->start_col=v2; break;
                    case 'R': lvl->ghost_red_r=v1;    lvl->ghost_red_c=v2;    break;
                    case 'G': lvl->ghost_green_r=v1;  lvl->ghost_green_c=v2;  break;
                    case 'Y': lvl->ghost_yellow_r=v1; lvl->ghost_yellow_c=v2; break;
                    case 'B': lvl->ghost_blue_r=v1;   lvl->ghost_blue_c=v2;   break;
                    default: break;
                }
            }
        } else {
            if (map_row>=lvl->h||map_row>=KL_MAX_H) break;
            if ((int)L<lvl->w) { memset(line+L,KL_WALL,lvl->w-L); line[lvl->w]='\0'; }
            for (int c=0; c<lvl->w; c++) {
                char ch=line[c]; lvl->grid[map_row][c]=ch;
                if (ch==KL_GEM||ch==KL_POTION||ch==KL_WATCH) {
                    if (lvl->n_coins>=KL_MAX_COINS) {
                        snprintf(err,err_sz,"Too many collectibles (%d max).",KL_MAX_COINS);
                        fclose(f); return false;
                    }
                    lvl->coin_index[map_row][c]=lvl->n_coins;
                    lvl->coin_rows[lvl->n_coins]=map_row;
                    lvl->coin_cols[lvl->n_coins]=c;
                    lvl->n_coins++;
                } else if (ch==KL_PORTAL&&lvl->n_portals<16) {
                    lvl->portal_rows[lvl->n_portals]=map_row;
                    lvl->portal_cols[lvl->n_portals]=c;
                    lvl->n_portals++;
                }
            }
            map_row++;
        }
    }
    fclose(f);
    if (lvl->w<=0||lvl->w>KL_MAX_W||lvl->h<=0||lvl->h>KL_MAX_H) {
        snprintf(err,err_sz,"Invalid dimensions (W=%d, H=%d).",lvl->w,lvl->h);
        return false;
    }
    if (map_row<lvl->h) { snprintf(err,err_sz,"Map has %d rows, expected %d.",map_row,lvl->h); return false; }
    if (lvl->start_row<0||lvl->start_col<0) { snprintf(err,err_sz,"No 'P <row> <col>'."); return false; }
    if (!is_walkable_char(lvl->grid[lvl->start_row][lvl->start_col])) {
        snprintf(err,err_sz,"Player start (%d,%d) not walkable.",lvl->start_row,lvl->start_col);
        return false;
    }
    return true;
}

/* ================================================================
 * MECANIQUE DE GLISSEMENT (identique à l'original)
 * ================================================================ */

static bool perpendicular_open(const kl_level_t *lvl, int r, int c, kl_dir_t dir)
{
    int d1,d2;
    if (dir==KL_DIR_U||dir==KL_DIR_D) { d1=KL_DIR_L; d2=KL_DIR_R; }
    else                               { d1=KL_DIR_U; d2=KL_DIR_D; }
    int r1=r+DR[d1],c1=c+DC[d1],r2=r+DR[d2],c2=c+DC[d2];
    bool ok1=(r1>=0&&r1<lvl->h&&c1>=0&&c1<lvl->w&&lvl->grid[r1][c1]!=KL_WALL);
    bool ok2=(r2>=0&&r2<lvl->h&&c2>=0&&c2<lvl->w&&lvl->grid[r2][c2]!=KL_WALL);
    return ok1||ok2;
}

static bool slide(const kl_level_t *lvl,
                  int r, int c, kl_dir_t dir, uint32_t mask_in,
                  int *out_r, int *out_c, uint32_t *out_mask)
{
    int dr=DR[dir],dc=DC[dir];
    int cr=r+dr,cc=c+dc;
    uint32_t mask=mask_in;
    if (cr<0||cr>=lvl->h||cc<0||cc>=lvl->w) return false;
    if (lvl->grid[cr][cc]==KL_WALL) return false;
    while (1) {
        int ci=lvl->coin_index[cr][cc];
        if (ci>=0) mask&=~(1u<<ci);
        int nr=cr+dr,nc=cc+dc;
        bool nwall=(nr<0||nr>=lvl->h||nc<0||nc>=lvl->w||lvl->grid[nr][nc]==KL_WALL);
        bool junc=perpendicular_open(lvl,cr,cc,dir);
        if (nwall||junc) break;
        cr=nr; cc=nc;
    }
    *out_r=cr; *out_c=cc; *out_mask=mask;
    return true;
}

/* ================================================================
 * NOUVEAU — Matrice de distances préprogrammées
 *
 * g_pdist[i][j] = slides minimum depuis position de repos gem i
 *                 pour collecter gem j.
 * g_pdist[n_coins][j] = slides depuis la position de départ
 *                        du joueur pour collecter gem j.
 *
 * Calcul : un BFS léger par gem source, espace H×W×5.
 * Complexité totale : O(n × H×W×5)  → négligeable.
 * ================================================================ */

static int g_pdist[KL_MAX_COINS+1][KL_MAX_COINS];

/*
 * g_cocollect[i][j] = 1 si un même slide peut ramasser les gems i et j.
 * Ces gems ne coûtent rien l'un par rapport à l'autre : l'heuristique
 * leur attribue une arête de poids 0, ce qui garantit que le MST reste
 * un MINORANT admissible (sans cela il surestime, et A* renvoie des
 * chemins non optimaux).
 */
static uint8_t g_cocollect[KL_MAX_COINS][KL_MAX_COINS];

typedef struct { short r,c,d; } bfs_s_t;
static bfs_s_t g_bfs_q[KL_MAX_H * KL_MAX_W * 5];

static void compute_dist_from(const kl_level_t *lvl,
                               int src_r, int src_c,
                               int out[KL_MAX_COINS])
{
    int H=lvl->h, W=lvl->w;
    static int dg[KL_MAX_H][KL_MAX_W][5];
    for (int r=0;r<H;r++)
        for (int c=0;c<W;c++)
            for (int d=0;d<5;d++) dg[r][c][d]=INT_MAX;
    for (int j=0;j<lvl->n_coins;j++) out[j]=INT_MAX;

    int head=0,tail=0;
    dg[src_r][src_c][KL_DIR_NONE]=0;
    g_bfs_q[tail++]=(bfs_s_t){(short)src_r,(short)src_c,(short)KL_DIR_NONE};

    while (head<tail) {
        bfs_s_t cur=g_bfs_q[head++];
        int g=dg[cur.r][cur.c][cur.d];

        for (int d=0;d<4;d++) {
            if (cur.d!=KL_DIR_NONE && d==(int)OPP_DIR[cur.d]) continue;
            int dr=DR[d],dc=DC[d];
            int cr=cur.r+dr, cc=cur.c+dc;
            if (cr<0||cr>=H||cc<0||cc>=W||lvl->grid[cr][cc]==KL_WALL) continue;

            /* Simuler le glissement, noter chaque gem rencontré */
            int sr=cr,sc=cc;
            while (1) {
                int ci=lvl->coin_index[sr][sc];
                if (ci>=0 && out[ci]==INT_MAX) out[ci]=g+1;
                int nr=sr+dr,nc=sc+dc;
                bool nw=(nr<0||nr>=H||nc<0||nc>=W||lvl->grid[nr][nc]==KL_WALL);
                bool jn=perpendicular_open(lvl,sr,sc,(kl_dir_t)d);
                if (nw||jn) break;
                sr=nr; sc=nc;
            }
            /* Enregistrer position de repos */
            if (dg[sr][sc][d]>g+1) {
                dg[sr][sc][d]=g+1;
                g_bfs_q[tail++]=(bfs_s_t){(short)sr,(short)sc,(short)d};
            }
        }
    }
}

static void precompute_dist_matrix(const kl_level_t *lvl)
{
    for (int i=0;i<lvl->n_coins;i++)
        compute_dist_from(lvl,lvl->coin_rows[i],lvl->coin_cols[i],g_pdist[i]);
    /* Position de départ = indice n_coins */
    compute_dist_from(lvl,lvl->start_row,lvl->start_col,g_pdist[lvl->n_coins]);

    /* Table de co-collecte : pour chaque cellule praticable et chaque
     * direction, on simule le slide et on marque toutes les paires de
     * gems présentes sur le trajet comme collectables ensemble. */
    memset(g_cocollect, 0, sizeof(g_cocollect));
    for (int r=0;r<lvl->h;r++) {
        for (int c=0;c<lvl->w;c++) {
            if (lvl->grid[r][c]==KL_WALL) continue;
            for (int d=0;d<4;d++) {
                int dr=DR[d],dc=DC[d];
                int cr=r+dr,cc=c+dc;
                if (cr<0||cr>=lvl->h||cc<0||cc>=lvl->w) continue;
                if (lvl->grid[cr][cc]==KL_WALL) continue;
                int on[KL_MAX_COINS], k=0;
                while (1) {
                    int ci=lvl->coin_index[cr][cc];
                    if (ci>=0) on[k++]=ci;
                    int nr=cr+dr,nc=cc+dc;
                    bool nw=(nr<0||nr>=lvl->h||nc<0||nc>=lvl->w||lvl->grid[nr][nc]==KL_WALL);
                    bool jn=perpendicular_open(lvl,cr,cc,(kl_dir_t)d);
                    if (nw||jn) break;
                    cr=nr; cc=nc;
                }
                for (int a=0;a<k;a++)
                    for (int b=a+1;b<k;b++) {
                        g_cocollect[on[a]][on[b]]=1;
                        g_cocollect[on[b]][on[a]]=1;
                    }
            }
        }
    }
}

/* ================================================================
 * NOUVEAU — Pattern Database : MST par masque de gems
 *
 * g_pdb[mask] = poids de l'arbre couvrant minimal (Prim, O(n²))
 *               sur les gems encore présents dans le masque.
 *
 * L'heuristique est admissible car le MST borne inférieurement
 * le coût pour collecter tous les gems restants.
 *
 * Mémoire : 4 × 2^20 = 4 Mo pour 20 gems (tolérable).
 * Durée de précalcul : ~0,2 s pour n=20 (fait une seule fois).
 * ================================================================ */

#define PDB_MAX_COINS 22

static int  *g_pdb   = NULL;
static int   g_pdb_n = 0;

static int mst_prim(int n, int nodes[])
{
    /* MST de Prim en O(m²) sur m=popcount(mask) nœuds */
    int key[KL_MAX_COINS], in[KL_MAX_COINS];
    for (int i=0;i<n;i++) { key[i]=INT_MAX; in[i]=0; }
    key[0]=0;
    int total=0;
    for (int iter=0;iter<n;iter++) {
        int minv=INT_MAX, u=-1;
        for (int i=0;i<n;i++) if (!in[i]&&key[i]<minv) { minv=key[i]; u=i; }
        if (u<0||minv==INT_MAX) return INT_MAX/2;
        in[u]=1; total+=minv;
        int a=nodes[u];
        for (int i=0;i<n;i++) {
            if (in[i]) continue;
            int b=nodes[i];
            int d;
            if (g_cocollect[a][b]) {
                d=0;   /* ramassés par un même slide → arête gratuite */
            } else {
                /* distance symétrique (minorant dans les deux sens) */
                int da=g_pdist[a][b], db=g_pdist[b][a];
                d=(da<db)?da:db;
            }
            if (d!=INT_MAX && d<key[i]) key[i]=d;
        }
    }
    return total;
}

static int mst_weight(const kl_level_t *lvl, uint32_t mask)
{
    if (!mask) return 0;
    int nodes[KL_MAX_COINS], m=0;
    for (int i=0;i<lvl->n_coins;i++)
        if (mask&(1u<<i)) nodes[m++]=i;
    if (m==1) return 0;
    return mst_prim(m,nodes);
}

static void precompute_pdb(const kl_level_t *lvl)
{
    g_pdb=NULL; g_pdb_n=0;
    int n=lvl->n_coins;
    if (n>PDB_MAX_COINS||n==0) return;
    int M=1<<n;
    g_pdb=(int*)malloc((size_t)M*sizeof(int));
    if (!g_pdb) return;
    g_pdb_n=n; g_pdb[0]=0;
    for (int mask=1;mask<M;mask++)
        g_pdb[mask]=mst_weight(lvl,(uint32_t)mask);
}

static inline int heuristic(const kl_level_t *lvl, uint32_t mask)
{
    if (!mask) return 0;
    if (g_pdb && lvl->n_coins==g_pdb_n) return g_pdb[mask];
    return mst_weight(lvl,mask);
}

/* ================================================================
 * Tables A* : nœuds + min-heap + table de hachage
 * ================================================================ */

#define BFS_MAX_NODES (4 * 1024 * 1024)    /* 4M nodes ~160 MB total */
#define HT_SIZE       (8 * 1024 * 1024)    /* power of 2            */

/* Nœud A* — 24 octets */
typedef struct {
    uint64_t key;
    int      parent;
    int      g;
    uint8_t  move;
    uint8_t  _pad[3];
} astar_node_t;

/* Entrée du min-heap */
typedef struct { int f; int idx; } heap_entry_t;

static astar_node_t *g_nodes = NULL;
static heap_entry_t *g_heap  = NULL;
static int          *g_ht    = NULL;
static int           g_heap_n = 0;
static int           g_n_nodes = 0;

/* ---- Hash table (open addressing, Fibonacci hashing) ----
 *
 * La table associe une clé d'état à l'indice du MEILLEUR nœud connu
 * (coût g minimal) pour cet état. L'heuristique MST est admissible
 * mais non consistante (un slide peut ramasser plusieurs gems, faisant
 * chuter h de plus de 1) : il faut donc autoriser la RÉOUVERTURE d'un
 * état atteint plus tard avec un coût inférieur, sinon A* renvoie des
 * chemins non optimaux. */
static void ht_init(void)
{
    memset(g_ht, -1, sizeof(int) * HT_SIZE);
}

/* Renvoie le slot de la clé (qu'elle existe déjà ou non).
 * *found reçoit l'indice du nœud existant, ou -1 si absent. */
static int ht_slot_of(uint64_t key, int *found)
{
    uint64_t h  = key * 11400714819323198485ull;
    int slot = (int)((h >> 28) & (uint64_t)(HT_SIZE-1));
    while (1) {
        int idx=g_ht[slot];
        if (idx==-1)               { *found=-1;  return slot; }
        if (g_nodes[idx].key==key) { *found=idx; return slot; }
        slot=(slot+1)&(HT_SIZE-1);
    }
}

static int ht_lookup_or_insert(uint64_t key, int new_idx)
{
    int found;
    int slot = ht_slot_of(key, &found);
    if (found==-1) { g_ht[slot]=new_idx; return -1; }
    return found;
}

/* ---- Min-heap binaire ---- */
static void heap_push(int f, int idx)
{
    if (g_heap_n>=BFS_MAX_NODES) return;
    int i=g_heap_n++;
    g_heap[i]=(heap_entry_t){f,idx};
    while (i>0) {
        int p=(i-1)>>1;
        if (g_heap[p].f<=g_heap[i].f) break;
        heap_entry_t t=g_heap[p]; g_heap[p]=g_heap[i]; g_heap[i]=t;
        i=p;
    }
}

static heap_entry_t heap_pop(void)
{
    heap_entry_t top=g_heap[0];
    g_heap[0]=g_heap[--g_heap_n];
    int i=0;
    while (1) {
        int l=2*i+1,r=2*i+2,s=i;
        if (l<g_heap_n&&g_heap[l].f<g_heap[s].f) s=l;
        if (r<g_heap_n&&g_heap[r].f<g_heap[s].f) s=r;
        if (s==i) break;
        heap_entry_t t=g_heap[s]; g_heap[s]=g_heap[i]; g_heap[i]=t;
        i=s;
    }
    return top;
}

/* ---- Allocation / libération des tables ---- */
static bool alloc_tables(char *err, size_t err_sz)
{
    g_nodes=(astar_node_t*)malloc(sizeof(astar_node_t)*BFS_MAX_NODES);
    g_heap =(heap_entry_t*)malloc(sizeof(heap_entry_t)*BFS_MAX_NODES);
    g_ht   =(int*)         malloc(sizeof(int)         *HT_SIZE);
    if (!g_nodes||!g_heap||!g_ht) {
        snprintf(err,err_sz,"Out of memory for A* tables.");
        free(g_nodes); free(g_heap); free(g_ht);
        g_nodes=NULL; g_heap=NULL; g_ht=NULL;
        return false;
    }
    ht_init();
    g_heap_n=0; g_n_nodes=0;
    return true;
}

static void free_tables(void)
{
    free(g_nodes); free(g_heap); free(g_ht);
    free(g_pdb);
    g_nodes=NULL; g_heap=NULL; g_ht=NULL; g_pdb=NULL; g_pdb_n=0;
}

/* ---- Encodage des clés d'état ---- */
static inline uint64_t state_key(int r, int c, kl_dir_t dir, uint32_t mask)
{
    return ((uint64_t)mask<<20)|((uint64_t)r<<13)|((uint64_t)c<<6)|
           ((uint64_t)dir<<3)|1ull;
}

static inline uint64_t safe_state_key(int r, int c, kl_dir_t dir,
                                       uint32_t mask, int turn)
{
    return ((uint64_t)mask<<23)|((uint64_t)(r&0x3F)<<17)|
           ((uint64_t)(c&0x3F)<<11)|((uint64_t)(dir&0x7)<<8)|
           ((uint64_t)(turn&0xFF));
}

/* ---- Reconstruction du chemin ---- */
static void reconstruct_path(kl_solution_t *sol, int goal)
{
    static kl_dir_t rev[KL_MAX_CELLS];
    int n=0, cur=goal;
    while (g_nodes[cur].parent!=-1) {
        rev[n++]=(kl_dir_t)g_nodes[cur].move;
        cur=g_nodes[cur].parent;
    }
    for (int i=0;i<n;i++) sol->moves[i]=rev[n-1-i];
    sol->n_moves=n; sol->solvable=true;
}

/* ================================================================
 * kl_solve — Solveur A* (gems uniquement)
 * ================================================================ */

bool kl_solve(const kl_level_t *lvl, kl_solution_t *sol,
              char *err, size_t err_sz)
{
    memset(sol,0,sizeof(*sol));
    if (lvl->n_coins==0) { sol->solvable=true; return true; }

    precompute_dist_matrix(lvl);
    precompute_pdb(lvl);

    if (!alloc_tables(err,err_sz)) { free(g_pdb); g_pdb=NULL; return false; }

    uint32_t full=(lvl->n_coins>=32)?0xFFFFFFFFu:((1u<<lvl->n_coins)-1u);
    uint64_t k0=state_key(lvl->start_row,lvl->start_col,KL_DIR_NONE,full);
    g_nodes[g_n_nodes]=(astar_node_t){k0,-1,0,(uint8_t)KL_DIR_NONE,{0,0,0}};
    ht_lookup_or_insert(k0,g_n_nodes);
    heap_push(heuristic(lvl,full),g_n_nodes++);

    int goal=-1; bool overflow=false;

    while (g_heap_n>0) {
        heap_entry_t top=heap_pop();
        int idx=top.idx;
        uint64_t k=g_nodes[idx].key;
        uint32_t mask=(uint32_t)(k>>20);
        int r=(int)((k>>13)&0x7F),c=(int)((k>>6)&0x7F);
        kl_dir_t dir=(kl_dir_t)((k>>3)&0x7);
        int g=g_nodes[idx].g;

        /* Ignorer une entrée périmée : un meilleur chemin vers cet
         * état a été trouvé après l'empilement de cette entrée. */
        {
            int found;
            ht_slot_of(k,&found);
            if (found!=-1 && g_nodes[found].g<g) continue;
        }

        if (mask==0) { goal=idx; break; }

        for (int d=0;d<4;d++) {
            if (dir!=KL_DIR_NONE&&(kl_dir_t)d==OPP_DIR[dir]) continue;
            int nr,nc; uint32_t nm;
            if (!slide(lvl,r,c,(kl_dir_t)d,mask,&nr,&nc,&nm)) continue;
            if (g_n_nodes>=BFS_MAX_NODES) { overflow=true; break; }

            uint64_t nk=state_key(nr,nc,(kl_dir_t)d,nm);
            int found;
            int slot=ht_slot_of(nk,&found);
            if (found!=-1 && g_nodes[found].g<=g+1) continue; /* pas mieux */

            g_nodes[g_n_nodes]=(astar_node_t){nk,idx,g+1,(uint8_t)d,{0,0,0}};
            g_ht[slot]=g_n_nodes;            /* enregistre le meilleur nœud */
            heap_push(g+1+heuristic(lvl,nm),g_n_nodes++);
        }
        if (overflow) break;
    }

    if (overflow) {
        snprintf(err,err_sz,
            "A* node table exhausted (%d nodes). "
            "Augmenter BFS_MAX_NODES dans solver.c si nécessaire.",
            BFS_MAX_NODES);
        free_tables(); return false;
    }
    if (goal>=0) reconstruct_path(sol,goal);
    else sol->solvable=false;

    free_tables(); return true;
}

/* ================================================================
 * Fantômes — trajectoires précalculées (identique à l'original)
 * ================================================================ */

#define KL_SAFE_MAX_TURNS 120

typedef struct { int r,c; bool visible; } kl_ghost_state_t;
typedef struct {
    kl_ghost_state_t state[KL_SAFE_MAX_TURNS+1];
    bool present;
} kl_ghost_traj_t;

static kl_dir_t std_ghost_next(const kl_level_t *lvl,
                                int r,int c, kl_dir_t last, bool is_red)
{
    static const kl_dir_t pR[4]={KL_DIR_R,KL_DIR_D,KL_DIR_L,KL_DIR_U};
    static const kl_dir_t pG[4]={KL_DIR_U,KL_DIR_L,KL_DIR_D,KL_DIR_R};
    const kl_dir_t *p=is_red?pR:pG;
    kl_dir_t rev=(last==KL_DIR_NONE)?KL_DIR_NONE:OPP_DIR[last];
    for (int i=0;i<4;i++) {
        kl_dir_t d=p[i]; if (d==rev) continue;
        int nr=r+DR[d],nc=c+DC[d];
        if (nr<0||nr>=lvl->h||nc<0||nc>=lvl->w) continue;
        if (lvl->grid[nr][nc]==KL_WALL) continue;
        return d;
    }
    if (rev!=KL_DIR_NONE) {
        int nr=r+DR[rev],nc=c+DC[rev];
        if (nr>=0&&nr<lvl->h&&nc>=0&&nc<lvl->w&&lvl->grid[nr][nc]!=KL_WALL)
            return rev;
    }
    return KL_DIR_NONE;
}

static void ghost_slide(const kl_level_t *lvl, int *r, int *c, kl_dir_t dir)
{
    int dr=DR[dir],dc=DC[dir],cr=*r+dr,cc=*c+dc;
    if (cr<0||cr>=lvl->h||cc<0||cc>=lvl->w||lvl->grid[cr][cc]==KL_WALL) return;
    *r=cr; *c=cc;
    while (1) {
        int nr=*r+dr,nc=*c+dc;
        bool nw=(nr<0||nr>=lvl->h||nc<0||nc>=lvl->w||lvl->grid[nr][nc]==KL_WALL);
        bool jn=perpendicular_open(lvl,*r,*c,dir);
        if (nw||jn) break;
        *r=nr; *c=nc;
    }
}

static void precompute_ghost(const kl_level_t *lvl, kl_ghost_traj_t *traj,
                              int sr, int sc, char type)
{
    traj->present=true;
    int r=sr,c=sc; kl_dir_t last=KL_DIR_NONE; bool vis=true; int tc=0;
    traj->state[0]=(kl_ghost_state_t){r,c,true};
    for (int t=1;t<=KL_SAFE_MAX_TURNS;t++) {
        if (type=='B') {
            if (++tc%2==0) {
                int idx=-1;
                for (int i=0;i<lvl->n_portals;i++)
                    if (lvl->portal_rows[i]==r&&lvl->portal_cols[i]==c){idx=i;break;}
                if (lvl->n_portals>0) {
                    int nx=(idx+1)%lvl->n_portals;
                    r=lvl->portal_rows[nx]; c=lvl->portal_cols[nx];
                }
                vis=true;
            } else vis=false;
        } else {
            kl_dir_t d=std_ghost_next(lvl,r,c,last,type=='R');
            if (d!=KL_DIR_NONE) { ghost_slide(lvl,&r,&c,d); last=d; }
        }
        traj->state[t]=(kl_ghost_state_t){r,c,vis};
    }
}

static bool slide_is_safe(const kl_level_t *lvl,
                           int r,int c,kl_dir_t dir,int turn,
                           const kl_ghost_traj_t *tR,
                           const kl_ghost_traj_t *tG,
                           const kl_ghost_traj_t *tB)
{
    int dr=DR[dir],dc=DC[dir],cr=r,cc=c; bool first=false;
    while (1) {
#define CHK(t) if(t&&t->present&&t->state[turn].visible&&\
                   t->state[turn].r==cr&&t->state[turn].c==cc) return false
        CHK(tR); CHK(tG); CHK(tB);
#undef CHK
        if (!first) {
            int nr=cr+dr,nc=cc+dc;
            if (nr<0||nr>=lvl->h||nc<0||nc>=lvl->w) return false;
            if (lvl->grid[nr][nc]==KL_WALL) return false;
            cr=nr; cc=nc; first=true; continue;
        }
        int nr=cr+dr,nc=cc+dc;
        bool nw=(nr<0||nr>=lvl->h||nc<0||nc>=lvl->w||lvl->grid[nr][nc]==KL_WALL);
        bool jn=perpendicular_open(lvl,cr,cc,dir);
        if (nw||jn) break;
        cr=nr; cc=nc;
    }
    return true;
}

/* ================================================================
 * kl_solve_safe — A* avec évitement des fantômes R/G/B
 * ================================================================ */

bool kl_solve_safe(const kl_level_t *lvl, kl_solution_t *sol,
                   char *err, size_t err_sz)
{
    memset(sol,0,sizeof(*sol));
    if (lvl->n_coins==0) { sol->solvable=true; return true; }

    precompute_dist_matrix(lvl);
    precompute_pdb(lvl);

    kl_ghost_traj_t tR={0},tG={0},tB={0};
    if (lvl->ghost_red_r  >=0) precompute_ghost(lvl,&tR,lvl->ghost_red_r,  lvl->ghost_red_c,  'R');
    if (lvl->ghost_green_r>=0) precompute_ghost(lvl,&tG,lvl->ghost_green_r,lvl->ghost_green_c,'G');
    if (lvl->ghost_blue_r >=0&&lvl->n_portals>=2)
        precompute_ghost(lvl,&tB,lvl->ghost_blue_r,lvl->ghost_blue_c,'B');

    const kl_ghost_traj_t *pR=(lvl->ghost_red_r  >=0)?&tR:NULL;
    const kl_ghost_traj_t *pG=(lvl->ghost_green_r>=0)?&tG:NULL;
    const kl_ghost_traj_t *pB=(lvl->ghost_blue_r >=0&&lvl->n_portals>=2)?&tB:NULL;

    if (!alloc_tables(err,err_sz)) { free(g_pdb); g_pdb=NULL; return false; }

    uint32_t full=(lvl->n_coins>=32)?0xFFFFFFFFu:((1u<<lvl->n_coins)-1u);
    uint64_t k0=safe_state_key(lvl->start_row,lvl->start_col,KL_DIR_NONE,full,0);
    g_nodes[g_n_nodes]=(astar_node_t){k0,-1,0,(uint8_t)KL_DIR_NONE,{0,0,0}};
    ht_lookup_or_insert(k0,g_n_nodes);
    heap_push(heuristic(lvl,full),g_n_nodes++);

    int goal=-1; bool overflow=false;

    while (g_heap_n>0) {
        heap_entry_t top=heap_pop();
        int idx=top.idx;
        uint64_t k=g_nodes[idx].key;
        uint32_t mask=(uint32_t)(k>>23);
        int r=(int)((k>>17)&0x3F),c=(int)((k>>11)&0x3F);
        kl_dir_t dir=(kl_dir_t)((k>>8)&0x7);
        int turn=(int)(k&0xFF), g=g_nodes[idx].g;

        /* Ignorer une entrée de tas périmée (réouverture A*). */
        {
            int found;
            ht_slot_of(k,&found);
            if (found!=-1 && g_nodes[found].g<g) continue;
        }

        if (mask==0) { goal=idx; break; }
        if (turn>=KL_SAFE_MAX_TURNS) continue;

        for (int d=0;d<4;d++) {
            if (dir!=KL_DIR_NONE&&(kl_dir_t)d==OPP_DIR[dir]) continue;
            int nr,nc; uint32_t nm;
            if (!slide(lvl,r,c,(kl_dir_t)d,mask,&nr,&nc,&nm)) continue;
            int nt=turn+1;
            if (!slide_is_safe(lvl,r,c,(kl_dir_t)d,nt,pR,pG,pB)) continue;
            if (g_n_nodes>=BFS_MAX_NODES) { overflow=true; break; }

            uint64_t nk=safe_state_key(nr,nc,(kl_dir_t)d,nm,nt);
            int found;
            int slot=ht_slot_of(nk,&found);
            if (found!=-1 && g_nodes[found].g<=g+1) continue;

            g_nodes[g_n_nodes]=(astar_node_t){nk,idx,g+1,(uint8_t)d,{0,0,0}};
            g_ht[slot]=g_n_nodes;
            heap_push(g+1+heuristic(lvl,nm),g_n_nodes++);
        }
        if (overflow) break;
    }

    if (overflow) {
        snprintf(err,err_sz,"Safe A* node table exhausted (%d nodes).",BFS_MAX_NODES);
        free_tables(); return false;
    }
    if (goal>=0) reconstruct_path(sol,goal);
    else sol->solvable=false;

    free_tables(); return true;
}
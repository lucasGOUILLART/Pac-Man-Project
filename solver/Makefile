# =========================================================
# Les fantômes d'Ombrequatre — Solver + Generator Makefile
# =========================================================

CC      ?= gcc
CFLAGS  ?= -std=c11 -O2 -Wall -Wextra -Wpedantic
LDFLAGS ?=

# ── Solver ───────────────────────────────────────────────
SOLVER_SRCS = solver.c main.c
SOLVER_OBJS = $(SOLVER_SRCS:.c=.o)
SOLVER      = solver

# ── Generator ────────────────────────────────────────────
# generator.c is standalone (no solver.h dependency).
GEN_SRC  = generator.c
GEN_OBJ  = generator.o
GEN      = generator

.PHONY: all clean test gen-test

all: $(SOLVER) $(GEN)

# ── Solver build ─────────────────────────────────────────
$(SOLVER): $(SOLVER_OBJS)
	$(CC) $(LDFLAGS) -o $@ $(SOLVER_OBJS)

solver.o: solver.c solver.h
	$(CC) $(CFLAGS) -c solver.c -o solver.o

main.o: main.c solver.h
	$(CC) $(CFLAGS) -c main.c -o main.o

# ── Generator build ──────────────────────────────────────
$(GEN): $(GEN_OBJ)
	$(CC) $(LDFLAGS) -o $@ $(GEN_OBJ)

$(GEN_OBJ): $(GEN_SRC)
	$(CC) $(CFLAGS) -c $(GEN_SRC) -o $(GEN_OBJ)

# ── Targets ──────────────────────────────────────────────
clean:
	rm -f $(SOLVER_OBJS) $(SOLVER) $(GEN_OBJ) $(GEN)

# Quick sanity test — solver on bundled levels
test: $(SOLVER)
	@echo "--- Level 1 ---"; ./$(SOLVER) ../levels/level1.txt
	@echo "--- Level 2 ---"; ./$(SOLVER) ../levels/level2.txt
	@echo "--- Level 3 ---"; ./$(SOLVER) ../levels/level3.txt

# Quick sanity test — generator produces parseable output
gen-test: $(GEN)
	@echo "--- easy ---";       ./$(GEN) easy
	@echo "--- medium ---";     ./$(GEN) medium
	@echo "--- hard ---";       ./$(GEN) hard
	@echo "--- impossible ---"; ./$(GEN) impossible

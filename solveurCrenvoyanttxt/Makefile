# =========================================================
# solveurCrenvoyanttxt — BDD -> fichiers .txt (solve_db)
# Reutilise le moteur BFS du projet : ../solver/solver.c
# =========================================================

CC       ?= gcc
CFLAGS   ?= -std=c11 -O2 -Wall -Wextra -Wpedantic
CFLAGS   += -I../solver -Isrc
LDFLAGS  ?=

SOLVER_CORE = ../solver/solver.c

SRC_DIR = src
OBJS_COMMON = solver_core.o batch_io.o

.PHONY: all clean solve_db solve_one

all: solve_db solve_one

solver_core.o: $(SOLVER_CORE) ../solver/solver.h
	$(CC) $(CFLAGS) -c $(SOLVER_CORE) -o $@

batch_io.o: $(SRC_DIR)/batch_io.c $(SRC_DIR)/batch_io.h ../solver/solver.h
	$(CC) $(CFLAGS) -c $(SRC_DIR)/batch_io.c -o $@

solve_db.o: $(SRC_DIR)/solve_db.c
	$(CC) $(CFLAGS) -c $(SRC_DIR)/solve_db.c -o $@

solve_one.o: $(SRC_DIR)/solve_one.c
	$(CC) $(CFLAGS) -c $(SRC_DIR)/solve_one.c -o $@

solve_db: $(OBJS_COMMON) solve_db.o
	$(CC) $(LDFLAGS) -o $@ $(OBJS_COMMON) solve_db.o

solve_one: $(OBJS_COMMON) solve_one.o
	$(CC) $(LDFLAGS) -o $@ $(OBJS_COMMON) solve_one.o

clean:
	rm -f solver_core.o batch_io.o solve_db.o solve_one.o solve_db solve_one solve_db.exe solve_one.exe

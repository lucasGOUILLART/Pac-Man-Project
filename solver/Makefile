# =========================================================
# Les fantômes d'Ombrequatre — Solver Makefile
# =========================================================

CC      ?= gcc
CFLAGS  ?= -std=c11 -O2 -Wall -Wextra -Wpedantic
LDFLAGS ?=

SRCS    = solver.c main.c
OBJS    = $(SRCS:.c=.o)
TARGET  = solver

.PHONY: all clean test

all: $(TARGET)

$(TARGET): $(OBJS)
	$(CC) $(LDFLAGS) -o $@ $(OBJS)

%.o: %.c solver.h
	$(CC) $(CFLAGS) -c $< -o $@

clean:
	rm -f $(OBJS) $(TARGET)

# Quick sanity test using the bundled levels
test: $(TARGET)
	@echo "--- Level 1 ---"; ./$(TARGET) ../levels/level1.txt
	@echo "--- Level 2 ---"; ./$(TARGET) ../levels/level2.txt
	@echo "--- Level 3 ---"; ./$(TARGET) ../levels/level3.txt

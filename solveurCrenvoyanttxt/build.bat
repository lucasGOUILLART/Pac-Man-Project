@echo off
REM Build solve_db.exe and solve_one.exe (requires gcc in PATH)
setlocal
cd /d "%~dp0"

where gcc >nul 2>&1
if errorlevel 1 (
    echo ERROR: gcc not found in PATH.
    echo Install MinGW-w64 or MSYS2, then run: make
    exit /b 1
)

set CFLAGS=-std=c11 -O2 -Wall -Wextra -Wpedantic -I../solver -Isrc

gcc %CFLAGS% -c ..\solver\solver.c -o solver_core.o
if errorlevel 1 exit /b 1
gcc %CFLAGS% -c src\batch_io.c -o batch_io.o
if errorlevel 1 exit /b 1
gcc %CFLAGS% -c src\solve_db.c -o solve_db.o
if errorlevel 1 exit /b 1
gcc %CFLAGS% -c src\solve_one.c -o solve_one.o
if errorlevel 1 exit /b 1

gcc -o solve_db.exe solver_core.o batch_io.o solve_db.o
if errorlevel 1 exit /b 1
gcc -o solve_one.exe solver_core.o batch_io.o solve_one.o
if errorlevel 1 exit /b 1

echo Built: solve_db.exe, solve_one.exe
exit /b 0

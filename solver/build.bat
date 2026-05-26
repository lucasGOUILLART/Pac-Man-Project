@echo off
echo === Ombrequatre Solver — Windows Build ===
echo.

:: Try gcc (MinGW / MSYS2 / winlibs)
where gcc >nul 2>&1
if %ERRORLEVEL% == 0 (
    echo Compiler: gcc
    gcc -std=c11 -O2 -Wall -Wextra -o solver.exe solver.c main.c
    if %ERRORLEVEL% == 0 (
        echo.
        echo SUCCESS: solver.exe is ready.
        goto :done
    ) else (
        echo FAILED: gcc reported an error.
        exit /b 1
    )
)

:: Try clang (LLVM)
where clang >nul 2>&1
if %ERRORLEVEL% == 0 (
    echo Compiler: clang
    clang -std=c11 -O2 -Wall -o solver.exe solver.c main.c
    if %ERRORLEVEL% == 0 (
        echo.
        echo SUCCESS: solver.exe is ready.
        goto :done
    ) else (
        echo FAILED: clang reported an error.
        exit /b 1
    )
)

:: Try MSVC cl.exe
where cl >nul 2>&1
if %ERRORLEVEL% == 0 (
    echo Compiler: MSVC cl
    cl /O2 /W3 /Fe:solver.exe solver.c main.c
    if %ERRORLEVEL% == 0 (
        echo.
        echo SUCCESS: solver.exe is ready.
        goto :done
    ) else (
        echo FAILED: cl reported an error.
        exit /b 1
    )
)

echo ERROR: No C compiler found ^(gcc, clang, or cl^).
echo.
echo Install one of:
echo   MinGW-w64 ^(recommended^): https://winlibs.com/
echo   LLVM/Clang:              https://releases.llvm.org/
echo   Visual Studio:           https://visualstudio.microsoft.com/
echo.
echo After installing, open a new terminal, cd to this folder, and re-run build.bat
exit /b 1

:done
echo.
echo Test: solver.exe --help ^(optional^)

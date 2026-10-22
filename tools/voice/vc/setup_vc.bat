@echo off
rem One-time setup for voice conversion (Chatterbox VC, MIT licence): you record a line the way it should be
rem said, and it comes out in the hero's voice with your timing and emphasis.
rem Its own Python environment, because it needs PyTorch 2.6 (the TTS environment uses a newer one).
rem Downloads about 3-4 GB the first time (Python 3.12, PyTorch with CUDA, the model). Safe to run again.
cd /d "%~dp0"
set UV=..\ComfyUI_windows_portable\python_embeded\python.exe -m uv
set HF_HOME=%~dp0hf

echo === 1/4 Creating the environment (Python 3.12) ===
%UV% venv .venv --python 3.12 || goto :fail

echo === 2/4 Installing PyTorch 2.6 with CUDA ===
%UV% pip install --python .venv\Scripts\python.exe torch==2.6.0 torchaudio==2.6.0 --index-url https://download.pytorch.org/whl/cu124 || goto :fail

echo === 3/4 Installing Chatterbox and an audio decoder ===
%UV% pip install --python .venv\Scripts\python.exe chatterbox-tts av soundfile --extra-index-url https://download.pytorch.org/whl/cu124 || goto :fail

echo === 4/4 Test: converting the hero's own voice sample back into his voice ===
if not exist recordings mkdir recordings
copy /y hero_voice.wav recordings\_test.wav >nul
.venv\Scripts\python.exe vc_run.py recordings converted hero_voice.wav || goto :fail
del recordings\_test.wav

echo.
echo All done. Put your recordings in %~dp0recordings and double-click convert.bat
pause
exit /b 0

:fail
echo.
echo Something went wrong above. Copy the text in this window and send it to Claude.
pause
exit /b 1

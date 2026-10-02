@echo off
rem Hexblast Windows exe 一键打包脚本
rem 前置条件：已安装 Visual Studio 2022(Community 或 Build Tools)
rem 并勾选「使用 C++ 的桌面开发」工作负载(含 MSVC v143 + Windows 10/11 SDK)
"C:\ProgramData\cocos\editors\Creator\3.8.8\CocosCreator.exe" --project "D:\yx" --build "platform=windows;buildPath=D:/yx/build;outputName=hexblast-win;debug=false;md5Cache=true"
echo.
echo 构建完成后的 exe 位于: D:\yx\build\hexblast-win\proj\hexblast.exe (同目录含资源)
pause

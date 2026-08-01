using System.IO;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;

public static class BuildPrototype
{
    public static void BuildWindows()
    {
        PlayerSettings.companyName = "Wayfarer Prototype";
        PlayerSettings.productName = "Wayfarer V0";
        PlayerSettings.SetScriptingBackend(NamedBuildTarget.Standalone, ScriptingImplementation.Mono2x);
        Directory.CreateDirectory("Builds/Windows");
        var options = new BuildPlayerOptions
        {
            scenes = new[] { "Assets/Scenes/Arena.unity" },
            locationPathName = "Builds/Windows/WayfarerV0.exe",
            target = BuildTarget.StandaloneWindows64,
            options = BuildOptions.Development
        };
        var report = BuildPipeline.BuildPlayer(options);
        if (report.summary.result != BuildResult.Succeeded)
            throw new BuildFailedException($"Build failed: {report.summary.result}");
        Debug.Log($"BUILD_OK {report.summary.outputPath} {report.summary.totalSize} bytes");
    }

    public static void BuildWebGL()
    {
        PlayerSettings.companyName = "Wayfarer Prototype";
        PlayerSettings.productName = "Wayfarer V0";
        PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Disabled;
        PlayerSettings.WebGL.template = "PROJECT:Wayfarer";
        Directory.CreateDirectory("Builds/WebGL");
        var options = new BuildPlayerOptions
        {
            scenes = new[] { "Assets/Scenes/Arena.unity" },
            locationPathName = "Builds/WebGL",
            target = BuildTarget.WebGL,
            options = BuildOptions.None
        };
        var report = BuildPipeline.BuildPlayer(options);
        if (report.summary.result != BuildResult.Succeeded)
            throw new BuildFailedException($"WebGL build failed: {report.summary.result}");
        Debug.Log($"WEBGL_BUILD_OK {report.summary.outputPath} {report.summary.totalSize} bytes");
    }
}

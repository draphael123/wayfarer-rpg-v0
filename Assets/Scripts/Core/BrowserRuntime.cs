using System.Runtime.InteropServices;

namespace ClasslessRPG
{
    public static class BrowserRuntime
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")]
        static extern void Wayfarer_ReloadPage();

        public static void ReloadPage() => Wayfarer_ReloadPage();
#else
        public static void ReloadPage() { }
#endif
    }
}

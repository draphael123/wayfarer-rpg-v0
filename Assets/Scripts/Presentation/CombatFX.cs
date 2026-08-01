using System.Collections;
using UnityEngine;

namespace ClasslessRPG
{
    public sealed class CombatFX : MonoBehaviour
    {
        static CombatFX instance;
        public static bool ShakeEnabled { get; private set; } = true;
        Camera cam;
        Vector3 cameraBase;
        void Awake() { instance = this; cam = Camera.main; ShakeEnabled = PlayerPrefs.GetInt("camera-shake", 1) == 1; }
        void LateUpdate() { if (cam) cameraBase = Vector3.Lerp(cameraBase, Vector3.zero, Time.deltaTime * 16); }

        public static void Hit(Vector3 point, Color color, float damage)
        {
            Burst(point, color, .55f);
            FloatingText.Create(point + Vector3.up * .5f, Mathf.RoundToInt(damage).ToString(), color);
            Shake(.06f, .06f);
        }

        public static void Burst(Vector3 point, Color color, float scale)
        {
            for (int i = 0; i < 7; i++)
            {
                var shard = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                Destroy(shard.GetComponent<Collider>());
                shard.transform.position = point;
                shard.transform.localScale = Vector3.one * Random.Range(.08f, .18f) * scale;
                shard.GetComponent<Renderer>().material = RuntimeArt.Material(color, true);
                instance.StartCoroutine(instance.Fly(shard.transform, Random.onUnitSphere * 3f * scale));
            }
        }

        public static void Trail(Vector3 point, Color color) => Burst(point, color, .22f);

        public static void Slash(Vector3 point, Quaternion rotation, Color color, float radius)
        {
            var slash = GameObject.CreatePrimitive(PrimitiveType.Cube);
            Destroy(slash.GetComponent<Collider>());
            slash.transform.SetPositionAndRotation(point + Vector3.up * .55f, rotation * Quaternion.Euler(0, 0, 25));
            slash.transform.localScale = new Vector3(radius * 1.25f, .08f, .16f);
            slash.GetComponent<Renderer>().material = RuntimeArt.Material(color, true);
            instance.StartCoroutine(instance.FadeScale(slash.transform, .13f));
        }

        public static void Line(Vector3 a, Vector3 b, Color color)
        {
            var line = new GameObject("Projectile trail").AddComponent<LineRenderer>();
            line.positionCount = 2; line.SetPosition(0, a); line.SetPosition(1, b);
            line.startWidth = .07f; line.endWidth = .02f;
            line.material = RuntimeArt.Material(color, true);
            Destroy(line.gameObject, .09f);
        }

        public static void Shake(float strength, float duration) { if (instance && ShakeEnabled) instance.StartCoroutine(instance.ShakeRoutine(strength, duration)); }
        public static void ToggleShake() { ShakeEnabled = !ShakeEnabled; PlayerPrefs.SetInt("camera-shake", ShakeEnabled ? 1 : 0); }
        IEnumerator ShakeRoutine(float strength, float duration)
        {
            var original = cam.transform.localPosition;
            float end = Time.time + duration;
            while (Time.time < end) { cam.transform.localPosition = original + Random.insideUnitSphere * strength; yield return null; }
            cam.transform.localPosition = original;
        }
        IEnumerator Fly(Transform t, Vector3 velocity)
        {
            float end = Time.time + .32f;
            while (t && Time.time < end) { t.position += velocity * Time.deltaTime; velocity += Vector3.down * 7f * Time.deltaTime; t.localScale *= .92f; yield return null; }
            if (t) Destroy(t.gameObject);
        }
        IEnumerator FadeScale(Transform t, float duration)
        {
            float end = Time.time + duration;
            while (t && Time.time < end) { t.localScale += new Vector3(2f, 0, 0) * Time.deltaTime; yield return null; }
            if (t) Destroy(t.gameObject);
        }
    }

    public sealed class FloatingText : MonoBehaviour
    {
        TextMesh mesh;
        public static void Create(Vector3 position, string text, Color color)
        {
            var go = new GameObject("Damage " + text);
            go.transform.position = position;
            var ft = go.AddComponent<FloatingText>();
            ft.mesh = go.AddComponent<TextMesh>();
            ft.mesh.text = text; ft.mesh.color = color; ft.mesh.fontSize = 48; ft.mesh.characterSize = .06f;
            ft.mesh.anchor = TextAnchor.MiddleCenter; ft.mesh.fontStyle = FontStyle.Bold;
        }
        void Update()
        {
            transform.position += Vector3.up * Time.deltaTime;
            transform.forward = Camera.main.transform.forward;
            var c = mesh.color; c.a -= Time.deltaTime * 1.5f; mesh.color = c;
            if (c.a <= 0) Destroy(gameObject);
        }
    }
}

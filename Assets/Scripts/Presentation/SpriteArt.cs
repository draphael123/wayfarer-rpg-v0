using UnityEngine;

namespace ClasslessRPG
{
    public sealed class SpriteBillboard : MonoBehaviour
    {
        Camera cam;
        Vector3 baseScale;
        float phase;
        void Start() { cam = Camera.main; baseScale = transform.localScale; phase = Random.value * 5f; }
        void LateUpdate()
        {
            if (!cam) return;
            transform.rotation = cam.transform.rotation;
            float breathe = 1f + Mathf.Sin(Time.time * 2.2f + phase) * .012f;
            transform.localScale = baseScale * breathe;
        }
    }

    public static class SpriteArt
    {
        static Texture2D characters;
        static Texture2D arena;
        public static Sprite Character(int index)
        {
            characters ??= Resources.Load<Texture2D>("Art/Characters");
            float halfW = characters.width * .5f, halfH = characters.height * .5f;
            int column = index % 2, rowFromTop = index / 2;
            var rect = new Rect(column * halfW, (1 - rowFromTop) * halfH, halfW, halfH);
            return Sprite.Create(characters, rect, new Vector2(.5f, .08f), 235f, 0, SpriteMeshType.FullRect);
        }

        public static Sprite Arena()
        {
            arena ??= Resources.Load<Texture2D>("Art/ForestArena");
            return Sprite.Create(arena, new Rect(0, 0, arena.width, arena.height), new Vector2(.5f, .5f), 100f, 0, SpriteMeshType.FullRect);
        }

        public static SpriteRenderer CharacterVisual(Transform root, int index, float scale = 1f)
        {
            var visual = new GameObject("Illustrated Character"); visual.transform.SetParent(root, false);
            visual.transform.localPosition = Vector3.up * .05f;
            visual.transform.localScale = Vector3.one * scale;
            var renderer = visual.AddComponent<SpriteRenderer>(); renderer.sprite = Character(index); renderer.sortingOrder = 10 + Mathf.RoundToInt(-root.position.z * 2);
            visual.AddComponent<SpriteBillboard>();
            return renderer;
        }
    }
}

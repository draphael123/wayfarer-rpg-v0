using UnityEngine;

namespace ClasslessRPG
{
    public sealed class SpriteBillboard : MonoBehaviour
    {
        Camera cam;
        Vector3 baseScale;
        Vector3 basePosition, lastRootPosition;
        SpriteRenderer sprite;
        float phase;
        void Start() { cam = Camera.main; sprite = GetComponent<SpriteRenderer>(); baseScale = transform.localScale; basePosition = transform.localPosition; lastRootPosition = transform.parent.position; phase = Random.value * 5f; }
        void LateUpdate()
        {
            if (!cam) return;
            transform.rotation = cam.transform.rotation;
            float breathe = 1f + Mathf.Sin(Time.time * 2.2f + phase) * .012f;
            transform.localScale = baseScale * breathe;
            float movement = (transform.parent.position - lastRootPosition).sqrMagnitude;
            float bob = movement > .0001f ? Mathf.Abs(Mathf.Sin(Time.time * 11f + phase)) * .09f : 0;
            transform.localPosition = basePosition + Vector3.up * bob;
            if (sprite) sprite.flipX = transform.parent.forward.x < -.05f;
            lastRootPosition = transform.parent.position;
        }
    }

    public static class SpriteArt
    {
        static Texture2D characters;
        static Texture2D arena;
        static Texture2D abilities;
        static readonly Sprite[] characterSprites = new Sprite[4];
        static readonly Sprite[] abilitySprites = new Sprite[3];
        static Sprite arenaSprite;
        public static Sprite Character(int index)
        {
            if (characterSprites[index]) return characterSprites[index];
            characters ??= Resources.Load<Texture2D>("Art/Characters");
            float width = characters.width / 4f;
            var rect = new Rect(index * width, 0, width, characters.height);
            return characterSprites[index] = Sprite.Create(characters, rect, new Vector2(.5f, .083f), 235f, 0, SpriteMeshType.FullRect);
        }

        public static Sprite Arena()
        {
            if (arenaSprite) return arenaSprite;
            arena ??= Resources.Load<Texture2D>("Art/ForestArena");
            return arenaSprite = Sprite.Create(arena, new Rect(0, 0, arena.width, arena.height), new Vector2(.5f, .5f), 100f, 0, SpriteMeshType.FullRect);
        }

        public static Sprite AbilityIcon(int index)
        {
            if (abilitySprites[index]) return abilitySprites[index];
            abilities ??= Resources.Load<Texture2D>("Art/Abilities");
            float width = abilities.width / 3f;
            return abilitySprites[index] = Sprite.Create(abilities, new Rect(index * width, 0, width, abilities.height), new Vector2(.5f, .5f), 220f, 0, SpriteMeshType.FullRect);
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

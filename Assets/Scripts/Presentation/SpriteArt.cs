using UnityEngine;

namespace ClasslessRPG
{
    public enum CharacterMotion { BasicAttack, HeavyAttack, Cast, Dash, Hit }

    public sealed class SpriteBillboard : MonoBehaviour
    {
        Camera cam;
        Vector3 baseScale;
        Vector3 basePosition, lastRootPosition;
        SpriteRenderer sprite;
        float phase;
        CharacterMotion motion;
        float motionStarted, motionDuration;
        public void Play(CharacterMotion next)
        {
            motion = next; motionStarted = Time.time;
            motionDuration = next switch
            {
                CharacterMotion.BasicAttack => .28f,
                CharacterMotion.HeavyAttack => .48f,
                CharacterMotion.Cast => .42f,
                CharacterMotion.Dash => .22f,
                _ => .2f
            };
        }
        void Start() { cam = Camera.main; sprite = GetComponent<SpriteRenderer>(); baseScale = transform.localScale; basePosition = transform.localPosition; lastRootPosition = transform.parent.position; phase = Random.value * 5f; }
        void LateUpdate()
        {
            if (!cam) return;
            float motionT = motionDuration > 0 ? Mathf.Clamp01((Time.time - motionStarted) / motionDuration) : 1f;
            bool activeMotion = motionT < 1f;
            float breathe = 1f + Mathf.Sin(Time.time * 2.2f + phase) * .012f;
            float movement = (transform.parent.position - lastRootPosition).sqrMagnitude;
            if (sprite) sprite.flipX = transform.parent.forward.x < -.05f;
            float facing = sprite && sprite.flipX ? -1f : 1f;
            float bob = movement > .0001f ? Mathf.Abs(Mathf.Sin(Time.time * 12f + phase)) * .11f : 0;
            float tilt = movement > .0001f ? Mathf.Sin(Time.time * 12f + phase) * 2.8f : 0;
            float lunge = 0, squashX = 1, squashY = 1;
            if (activeMotion)
            {
                float arc = Mathf.Sin(motionT * Mathf.PI);
                switch (motion)
                {
                    case CharacterMotion.BasicAttack: lunge = arc * .32f; tilt += Mathf.Lerp(-12f, 18f, motionT) * arc; squashX += arc * .12f; squashY -= arc * .07f; break;
                    case CharacterMotion.HeavyAttack: lunge = arc * .48f; tilt += Mathf.Lerp(-20f, 24f, motionT) * arc; squashX += arc * .2f; squashY -= arc * .12f; break;
                    case CharacterMotion.Cast: bob += arc * .28f; squashX += arc * .08f; squashY += arc * .14f; tilt += Mathf.Sin(motionT * Mathf.PI * 2f) * 5f; break;
                    case CharacterMotion.Dash: lunge = arc * .65f; tilt -= facing * 12f * arc; squashX += arc * .26f; squashY -= arc * .12f; break;
                    case CharacterMotion.Hit: lunge = -arc * .28f; tilt -= facing * 10f * arc; squashX -= arc * .08f; squashY += arc * .08f; break;
                }
            }
            transform.position = transform.parent.position + Vector3.up * (basePosition.y + bob) + cam.transform.right * (lunge * facing);
            transform.rotation = cam.transform.rotation * Quaternion.Euler(0, 0, tilt * facing);
            transform.localScale = Vector3.Scale(baseScale * breathe, new Vector3(squashX, squashY, 1));
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

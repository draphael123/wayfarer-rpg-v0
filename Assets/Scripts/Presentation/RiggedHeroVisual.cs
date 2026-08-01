using UnityEngine;

namespace ClasslessRPG
{
    public sealed class RiggedHeroVisual : MonoBehaviour
    {
        Transform actor, torso, head, frontUpperArm, frontForearm, backUpperArm, backForearm;
        Transform frontThigh, frontShin, frontBoot, backThigh, backShin, backBoot, sword;
        SpriteRenderer[] renderers;
        Camera cam;
        Vector3 lastActorPosition;
        float walkPhase, motionStarted, motionDuration;
        CharacterMotion motion;
        int outfitIndex;
        bool illustrated;

        public static RiggedHeroVisual Create(Transform actor)
        {
            var go = new GameObject("Rigged cutout warrior");
            go.transform.SetParent(actor, false);
            var rig = go.AddComponent<RiggedHeroVisual>();
            rig.actor = actor;
            rig.Build();
            return rig;
        }

        public void Play(CharacterMotion next)
        {
            motion = next; motionStarted = Time.time;
            motionDuration = next switch
            {
                CharacterMotion.BasicAttack => .34f,
                CharacterMotion.HeavyAttack => .56f,
                CharacterMotion.Cast => .52f,
                CharacterMotion.Dash => .24f,
                _ => .22f
            };
        }

        void Build()
        {
            cam = Camera.main;
            lastActorPosition = actor.position;
            if (BuildIllustrated()) { illustrated = true; renderers = GetComponentsInChildren<SpriteRenderer>(); SetOutfit(0); return; }
            Part("Cape", transform, new Vector2(-.12f, 1.38f), ShapeSprite.Tunic, new Color(.09f, .2f, .27f), new Vector2(.92f, 1.2f), 3);
            backThigh = Limb("Back thigh", transform, new Vector2(-.16f, .92f), .34f, .42f, new Color(.28f, .22f, .15f), 4, out backShin);
            AddLowerLeg(backThigh, ref backShin, out backBoot, 4);
            frontThigh = Limb("Front thigh", transform, new Vector2(.16f, .92f), .34f, .42f, new Color(.34f, .27f, .18f), 9, out frontShin);
            AddLowerLeg(frontThigh, ref frontShin, out frontBoot, 9);

            backUpperArm = Limb("Shield upper arm", transform, new Vector2(-.4f, 1.72f), .32f, .46f, new Color(.19f, .36f, .48f), 6, out backForearm);
            backForearm = Limb("Shield forearm", backUpperArm, new Vector2(0, -.46f), .28f, .4f, new Color(.78f, .55f, .34f), 7, out _);
            Part("Back shoulder", transform, new Vector2(-.4f, 1.72f), ShapeSprite.Circle, new Color(.55f, .6f, .62f), new Vector2(.44f, .38f), 13);
            var shield = Part("Round shield", backForearm, new Vector2(-.08f, -.34f), ShapeSprite.Circle, new Color(.43f, .23f, .08f), new Vector2(.76f, .76f), 22);
            Part("Shield boss", shield, Vector2.zero, ShapeSprite.Circle, new Color(.68f, .7f, .68f), new Vector2(.24f, .24f), 23);

            torso = Part("Primary tunic", transform, new Vector2(0, 1.38f), ShapeSprite.Tunic, new Color(.15f, .4f, .55f), new Vector2(1.0f, 1.16f), 14);
            Part("Tunic trim", torso, new Vector2(0, -.34f), ShapeSprite.Capsule, new Color(.85f, .63f, .2f), new Vector2(.88f, .11f), 16);
            Part("Belt", torso, new Vector2(0, -.22f), ShapeSprite.Capsule, new Color(.35f, .18f, .06f), new Vector2(.96f, .17f), 17);
            Part("Buckle", torso, new Vector2(0, -.22f), ShapeSprite.Circle, new Color(.92f, .7f, .24f), new Vector2(.18f, .18f), 18);

            frontUpperArm = Limb("Sword upper arm", transform, new Vector2(.4f, 1.72f), .32f, .46f, new Color(.21f, .45f, .58f), 19, out frontForearm);
            frontForearm = Limb("Sword forearm", frontUpperArm, new Vector2(0, -.46f), .28f, .4f, new Color(.8f, .57f, .35f), 20, out _);
            Part("Front shoulder", transform, new Vector2(.4f, 1.72f), ShapeSprite.Circle, new Color(.65f, .68f, .68f), new Vector2(.44f, .38f), 21);
            sword = new GameObject("Sword pivot").transform; sword.SetParent(frontForearm, false); sword.localPosition = new Vector3(0, -.38f, 0); sword.localRotation = Quaternion.Euler(0, 0, -38f);
            Part("Sword blade", sword, new Vector2(0, .5f), ShapeSprite.Capsule, new Color(.82f, .9f, .91f), new Vector2(.13f, 1.0f), 25);
            Part("Sword guard", sword, new Vector2(0, .02f), ShapeSprite.Capsule, new Color(.67f, .46f, .15f), new Vector2(.5f, .12f), 26);

            Part("Hair", transform, new Vector2(-.05f, 2.22f), ShapeSprite.Circle, new Color(.2f, .09f, .025f), new Vector2(.84f, .78f), 17);
            head = Part("Head", transform, new Vector2(.04f, 2.15f), ShapeSprite.Circle, new Color(.86f, .61f, .39f), new Vector2(.7f, .68f), 18);
            Part("Beard", head, new Vector2(.03f, -.22f), ShapeSprite.Beard, new Color(.25f, .11f, .025f), new Vector2(.62f, .34f), 19);
            Part("Eye white", head, new Vector2(.2f, .06f), ShapeSprite.Circle, Color.white, new Vector2(.13f, .11f), 20);
            Part("Eye", head, new Vector2(.23f, .06f), ShapeSprite.Circle, Color.black, new Vector2(.055f, .055f), 21);
            Part("Nose", head, new Vector2(.3f, -.03f), ShapeSprite.Circle, new Color(.76f, .48f, .28f), new Vector2(.13f, .11f), 22);

            renderers = GetComponentsInChildren<SpriteRenderer>();
            SetOutfit(0);
        }

        public void SetOutfit(int index)
        {
            outfitIndex = Mathf.Abs(index) % 3;
            Color primary = outfitIndex switch { 1 => new Color(.62f, .17f, .12f), 2 => new Color(.2f, .45f, .22f), _ => new Color(.15f, .4f, .55f) };
            Color trim = outfitIndex switch { 1 => new Color(.96f, .82f, .5f), 2 => new Color(.78f, .67f, .3f), _ => new Color(.85f, .63f, .2f) };
            Color leather = outfitIndex switch { 1 => new Color(.18f, .12f, .1f), 2 => new Color(.32f, .2f, .08f), _ => new Color(.35f, .18f, .06f) };
            foreach (var renderer in GetComponentsInChildren<SpriteRenderer>())
            {
                string part = renderer.name;
                if (illustrated)
                {
                    renderer.color = part.Contains("Outfit dye") ? primary : Color.white;
                    continue;
                }
                else if (part.Contains("Primary tunic")) renderer.color = primary;
                else if (part.Contains("Cape")) renderer.color = primary * .58f + new Color(0, 0, 0, .42f);
                else if (part.Contains("Tunic trim") || part.Contains("Buckle")) renderer.color = trim;
                else if (part.Contains("Belt") || part.Contains("Boot") || part.Contains("shield")) renderer.color = leather;
                else if (part.Contains("upper arm")) renderer.color = Color.Lerp(primary, Color.white, .08f);
            }
        }

        public void CycleOutfit() => SetOutfit(outfitIndex + 1);

        bool BuildIllustrated()
        {
            if (!HeroPartArt.Available) return false;
            backThigh = ArtPart("Back thigh", transform, new Vector2(-.14f, .74f), HeroPart.ThighLeft, .53f, 4);
            backShin = ArtPart("Back shin and boot", backThigh, new Vector2(0, -.35f), HeroPart.ShinRight, .5f, 5);
            backBoot = new GameObject("Back boot pivot").transform; backBoot.SetParent(backShin, false);
            frontThigh = ArtPart("Front thigh", transform, new Vector2(.14f, .74f), HeroPart.ThighRight, .55f, 9);
            frontShin = ArtPart("Front shin and boot", frontThigh, new Vector2(0, -.35f), HeroPart.ShinLeft, .52f, 10);
            frontBoot = new GameObject("Front boot pivot").transform; frontBoot.SetParent(frontShin, false);

            backUpperArm = ArtPart("Shield upper arm", transform, new Vector2(-.34f, 1.3f), HeroPart.UpperArmLeft, .5f, 6);
            backForearm = ArtPart("Shield forearm", backUpperArm, new Vector2(0, -.36f), HeroPart.ForearmRight, .45f, 7);
            var shield = ArtPart("Shield", backForearm, new Vector2(-.13f, -.27f), HeroPart.Shield, .55f, 22);
            shield.localRotation = Z(4f);

            torso = ArtPart("Primary tunic illustrated", transform, new Vector2(0, .72f), HeroPart.Torso, .66f, 14);
            frontUpperArm = ArtPart("Sword upper arm", transform, new Vector2(.34f, 1.3f), HeroPart.UpperArmRight, .5f, 19);
            frontForearm = ArtPart("Sword forearm", frontUpperArm, new Vector2(0, -.36f), HeroPart.ForearmLeft, .45f, 20);
            sword = ArtPart("Sword", frontForearm, new Vector2(.1f, -.46f), HeroPart.Sword, .46f, 25);
            sword.localRotation = Z(18f);
            head = ArtPart("Illustrated head", transform, new Vector2(.02f, 1.4f), HeroPart.Head, .78f, 24);
            return true;
        }

        Transform ArtPart(string name, Transform parent, Vector2 position, HeroPart part, float scale, int order)
        {
            // Keep the animation joint at unit scale. Scaling the joint itself makes every
            // nested forearm/shin inherit the scale again and pulls the cutout apart.
            var joint = new GameObject(name + " joint").transform;
            joint.SetParent(parent, false);
            joint.localPosition = position;

            var artwork = new GameObject(name);
            artwork.transform.SetParent(joint, false);
            artwork.transform.localScale = Vector3.one * scale;
            var renderer = artwork.AddComponent<SpriteRenderer>();
            renderer.sprite = HeroPartArt.Get(part);
            renderer.sortingOrder = order;
            Sprite dyeSprite = HeroPartArt.GetDye(part);
            if (dyeSprite)
            {
                var dye = new GameObject(name + " Outfit dye");
                dye.transform.SetParent(artwork.transform, false);
                var dyeRenderer = dye.AddComponent<SpriteRenderer>();
                dyeRenderer.sprite = dyeSprite;
                dyeRenderer.sortingOrder = order + 1;
            }
            return joint;
        }

        void AddLowerLeg(Transform thigh, ref Transform shin, out Transform boot, int order)
        {
            shin = Limb("Shin", thigh, new Vector2(0, -.4f), .28f, .38f, new Color(.48f, .31f, .15f), order + 1, out _);
            boot = Part("Boot", shin, new Vector2(.1f, -.36f), ShapeSprite.Boot, new Color(.22f, .12f, .055f), new Vector2(.52f, .28f), order + 2);
        }

        Transform Limb(string name, Transform parent, Vector2 joint, float width, float length, Color color, int order, out Transform unused)
        {
            var pivot = new GameObject(name + " pivot").transform; pivot.SetParent(parent, false); pivot.localPosition = joint;
            Part(name, pivot, new Vector2(0, -length * .5f), ShapeSprite.Capsule, color, new Vector2(width, length), order);
            unused = null;
            return pivot;
        }

        Transform Part(string name, Transform parent, Vector2 position, ShapeSprite shape, Color color, Vector2 scale, int order)
        {
            var go = new GameObject(name); go.transform.SetParent(parent, false); go.transform.localPosition = position; go.transform.localScale = new Vector3(scale.x, scale.y, 1);
            var renderer = go.AddComponent<SpriteRenderer>(); renderer.sprite = CutoutShapes.Get(shape); renderer.color = color; renderer.sortingOrder = order;
            return go.transform;
        }

        void LateUpdate()
        {
            if (!actor || !cam) return;
            Vector3 delta = actor.position - lastActorPosition;
            bool walking = delta.sqrMagnitude > .00001f;
            walkPhase += Time.deltaTime * (walking ? 10f : 2.2f);
            float stride = walking ? Mathf.Sin(walkPhase) : 0;
            float bob = walking ? Mathf.Abs(Mathf.Cos(walkPhase)) * .075f : Mathf.Sin(walkPhase) * .018f;

            frontThigh.localRotation = Z(stride * 25f);
            backThigh.localRotation = Z(-stride * 25f);
            frontShin.localRotation = Z(Mathf.Max(0, -stride) * 34f);
            backShin.localRotation = Z(Mathf.Max(0, stride) * 34f);
            frontBoot.localRotation = Z(-stride * 13f - Mathf.Max(0, -stride) * 18f);
            backBoot.localRotation = Z(stride * 13f - Mathf.Max(0, stride) * 18f);
            frontUpperArm.localRotation = Z(-stride * 16f + 7f);
            backUpperArm.localRotation = Z(stride * 16f - 7f);
            frontForearm.localRotation = Z(-70f + (walking ? 8f : 0));
            backForearm.localRotation = Z(70f + (walking ? -8f : 0));
            sword.localRotation = Z(18f);

            float tilt = walking ? stride * 1.8f : 0, lunge = 0, squashX = 1, squashY = 1;
            float t = motionDuration > 0 ? Mathf.Clamp01((Time.time - motionStarted) / motionDuration) : 1f;
            if (t < 1f)
            {
                float arc = Mathf.Sin(t * Mathf.PI);
                switch (motion)
                {
                    case CharacterMotion.BasicAttack:
                        frontUpperArm.localRotation = Z(Mathf.Lerp(-48f, 76f, Smooth(t)));
                        frontForearm.localRotation = Z(Mathf.Lerp(-112f, -18f, Smooth(t)));
                        sword.localRotation = Z(18f); lunge = arc * .24f; tilt = arc * -6f; break;
                    case CharacterMotion.HeavyAttack:
                        frontUpperArm.localRotation = Z(Mathf.Lerp(-78f, 105f, Smooth(t)));
                        frontForearm.localRotation = Z(Mathf.Lerp(-125f, 5f, Smooth(t)));
                        sword.localRotation = Z(12f); lunge = arc * .4f; tilt = arc * -10f; squashX += arc * .08f; squashY -= arc * .06f; break;
                    case CharacterMotion.Cast:
                        frontUpperArm.localRotation = Z(Mathf.Lerp(5f, 142f, arc));
                        backUpperArm.localRotation = Z(Mathf.Lerp(-5f, -128f, arc));
                        frontForearm.localRotation = Z(-32f * arc); backForearm.localRotation = Z(30f * arc); bob += arc * .16f; break;
                    case CharacterMotion.Dash:
                        tilt = -13f * arc; lunge = .5f * arc; squashX += .18f * arc; squashY -= .1f * arc; break;
                    case CharacterMotion.Hit:
                        tilt = 11f * arc; lunge = -.22f * arc; frontUpperArm.localRotation = Z(-25f * arc); backUpperArm.localRotation = Z(20f * arc); break;
                }
            }

            float facing = actor.forward.x < -.05f ? -1f : 1f;
            transform.position = actor.position + Vector3.up * (.02f + bob) + cam.transform.right * (lunge * facing);
            transform.rotation = cam.transform.rotation * Quaternion.Euler(0, 0, tilt * facing);
            transform.localScale = new Vector3(facing * squashX, squashY, 1);
            lastActorPosition = actor.position;
        }

        static Quaternion Z(float angle) => Quaternion.Euler(0, 0, angle);
        static float Smooth(float t) => t * t * (3f - 2f * t);
    }

    public static class CharacterAnimation
    {
        public static void Play(Transform actor, CharacterMotion motion)
        {
            var rig = actor.GetComponentInChildren<RiggedHeroVisual>();
            if (rig) rig.Play(motion);
            else actor.GetComponentInChildren<SpriteBillboard>()?.Play(motion);
        }
    }

    public enum ShapeSprite { Circle, Capsule, Tunic, Beard, Boot }

    public static class CutoutShapes
    {
        static readonly Sprite[] sprites = new Sprite[5];
        public static Sprite Get(ShapeSprite shape) => sprites[(int)shape] ??= Create(shape);

        static Sprite Create(ShapeSprite shape)
        {
            const int size = 64;
            var texture = new Texture2D(size, size, TextureFormat.RGBA32, false) { name = "Outlined " + shape, filterMode = FilterMode.Bilinear, wrapMode = TextureWrapMode.Clamp };
            var pixels = new Color32[size * size];
            for (int y = 0; y < size; y++)
            for (int x = 0; x < size; x++)
            {
                float nx = (x + .5f) / size - .5f, ny = (y + .5f) / size - .5f;
                bool outer, inner;
                if (shape == ShapeSprite.Circle)
                {
                    float d = Mathf.Sqrt(nx * nx + ny * ny); outer = d <= .48f; inner = d <= .39f;
                }
                else if (shape == ShapeSprite.Capsule || shape == ShapeSprite.Boot)
                {
                    float major = shape == ShapeSprite.Boot ? nx : ny, minor = shape == ShapeSprite.Boot ? ny : nx;
                    float dOuter = Mathf.Sqrt(minor * minor + Mathf.Pow(Mathf.Max(Mathf.Abs(major) - .19f, 0), 2));
                    outer = dOuter <= .29f; inner = dOuter <= .21f;
                }
                else if (shape == ShapeSprite.Tunic)
                {
                    float outerWidth = Mathf.Lerp(.47f, .34f, ny + .5f), innerWidth = outerWidth - .065f;
                    outer = Mathf.Abs(ny) <= .48f && Mathf.Abs(nx) <= outerWidth;
                    inner = Mathf.Abs(ny) <= .4f && Mathf.Abs(nx) <= innerWidth;
                }
                else
                {
                    float d = Mathf.Sqrt(nx * nx + Mathf.Pow(ny + .05f, 2));
                    outer = d <= .48f && ny < .18f; inner = d <= .39f && ny < .1f;
                }
                pixels[y * size + x] = inner ? new Color32(255, 255, 255, 255) : outer ? new Color32(35, 25, 17, 255) : new Color32(0, 0, 0, 0);
            }
            texture.SetPixels32(pixels); texture.Apply(false, true);
            return Sprite.Create(texture, new Rect(0, 0, size, size), new Vector2(.5f, .5f), size, 0, SpriteMeshType.FullRect);
        }
    }

    public enum HeroPart { Head, Torso, UpperArmLeft, UpperArmRight, ForearmLeft, ForearmRight, ThighLeft, ThighRight, ShinLeft, ShinRight, Shield, Sword }

    public static class HeroPartArt
    {
        static Texture2D headTexture;
        static readonly Sprite[] sprites = new Sprite[12];
        public static bool Available { get { headTexture ??= Resources.Load<Texture2D>("Art/HeroParts/Head"); return headTexture; } }

        public static Sprite Get(HeroPart part)
        {
            int index = (int)part;
            if (sprites[index]) return sprites[index];
            if (!Available) return null;
            Texture2D texture = part == HeroPart.Head ? headTexture : Resources.Load<Texture2D>("Art/HeroParts/" + part);
            Vector2 pivot = Pivot(part);
            return sprites[index] = Sprite.Create(texture, new Rect(0, 0, texture.width, texture.height), pivot, 300f, 0, SpriteMeshType.FullRect);
        }

        public static Sprite GetDye(HeroPart part)
        {
            Texture2D texture = Resources.Load<Texture2D>("Art/HeroParts/" + part + "Dye");
            return texture ? Sprite.Create(texture, new Rect(0, 0, texture.width, texture.height), Pivot(part), 300f, 0, SpriteMeshType.FullRect) : null;
        }

        static Vector2 Pivot(HeroPart part) => part switch
        {
            HeroPart.Head => new Vector2(.5f, .08f),
            HeroPart.Torso => new Vector2(.5f, .06f),
            HeroPart.UpperArmLeft or HeroPart.UpperArmRight => new Vector2(.5f, .91f),
            HeroPart.ForearmLeft or HeroPart.ForearmRight => new Vector2(.5f, .91f),
            HeroPart.ThighLeft or HeroPart.ThighRight => new Vector2(.5f, .91f),
            HeroPart.ShinLeft or HeroPart.ShinRight => new Vector2(.5f, .91f),
            HeroPart.Shield => new Vector2(.5f, .5f),
            _ => new Vector2(.5f, .06f)
        };
    }
}

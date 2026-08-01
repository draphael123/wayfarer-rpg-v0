using System.Collections;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace ClasslessRPG
{
    public sealed class GameBootstrap : MonoBehaviour
    {
        static GameBootstrap instance;
        Transform player;
        int wave;
        int living;
        GameHUD hud;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Boot()
        {
            if (FindAnyObjectByType<GameBootstrap>()) return;
            new GameObject("Game Bootstrap").AddComponent<GameBootstrap>();
        }

        void Awake()
        {
            instance = this;
            SetupWorld();
            StartCoroutine(Waves());
        }

        void SetupWorld()
        {
            var camGo = new GameObject("Main Camera");
            camGo.tag = "MainCamera";
            var cam = camGo.AddComponent<Camera>(); cam.orthographic = true; cam.orthographicSize = 9.2f; cam.backgroundColor = new Color(.055f, .09f, .12f); cam.clearFlags = CameraClearFlags.SolidColor;
            camGo.transform.SetPositionAndRotation(new Vector3(0, 13, -16), Quaternion.Euler(36, 0, 0));
            new GameObject("Combat FX").AddComponent<CombatFX>();
            new GameObject("Audio").AddComponent<AudioDirector>();

            var backdrop = new GameObject("Painted Forest Arena");
            backdrop.transform.SetPositionAndRotation(new Vector3(0, 3.1f, 6.4f), camGo.transform.rotation);
            backdrop.transform.localScale = Vector3.one * 1.68f;
            var backdropRenderer = backdrop.AddComponent<SpriteRenderer>(); backdropRenderer.sprite = SpriteArt.Arena(); backdropRenderer.sortingOrder = -50;

            var light = new GameObject("Warm Key Light").AddComponent<Light>(); light.type = LightType.Directional; light.intensity = 1.35f; light.color = new Color(1f, .82f, .58f); light.transform.rotation = Quaternion.Euler(48, -35, 0);
            var floor = RuntimeArt.Primitive("Ancient Arena", PrimitiveType.Cube, new Vector3(0, -.3f, 0), new Vector3(28, .6f, 20), new Color(.075f, .13f, .14f));
            floor.GetComponent<Renderer>().enabled = false;

            var p = new GameObject("Wayfarer"); p.transform.position = new Vector3(0, .65f, 1.2f);
            var collider = p.AddComponent<CapsuleCollider>(); collider.height = 1.8f; collider.radius = .45f;
            var stats = p.AddComponent<CharacterStats>();
            var hp = p.AddComponent<Health>(); hp.IsPlayer = true;
            p.AddComponent<AbilitySystem>(); p.AddComponent<PlayerController>();
            SpriteArt.CharacterVisual(p.transform, 0, 1.68f);
            var selection = RuntimeArt.Primitive("Selected hero ring", PrimitiveType.Cylinder, new Vector3(0, .03f, 1.2f), new Vector3(.62f, .018f, .62f), new Color(.2f, .72f, .78f));
            selection.GetComponent<Collider>().enabled = false;
            selection.transform.SetParent(p.transform, true);
            p.AddComponent<WorldHealthBar>();
            player = p.transform;
            hud = new GameObject("HUD").AddComponent<GameHUD>(); hud.Initialize(p);
        }

        IEnumerator Waves()
        {
            yield return new WaitForSeconds(1.2f);
            while (player)
            {
                if (living == 0)
                {
                    if (wave > 0)
                    {
                        player.GetComponent<Health>().Restore(player.GetComponent<Health>().Max * .16f);
                        yield return new WaitForSeconds(2.5f);
                    }
                    wave++;
                    hud.SetWave(wave);
                    int count = Mathf.Min(1 + wave, 6);
                    for (int i = 0; i < count; i++)
                    {
                        var type = wave % 3 == 0 && i == count - 1 ? EnemyType.Ogre : (i % 3 == 1 ? EnemyType.Archer : EnemyType.Goblin);
                        Spawn(type, i, count);
                    }
                }
                yield return new WaitForSeconds(1f);
            }
        }

        void Spawn(EnemyType type, int index, int count)
        {
            float angle = index / (float)count * Mathf.PI * 2 + wave;
            var go = new GameObject(type.ToString()); go.transform.position = new Vector3(Mathf.Cos(angle) * 10f, type == EnemyType.Ogre ? .9f : .55f, Mathf.Sin(angle) * 5.4f);
            var col = go.AddComponent<CapsuleCollider>(); col.height = type == EnemyType.Ogre ? 2.3f : 1.6f; col.radius = type == EnemyType.Ogre ? .72f : .42f;
            var hp = go.AddComponent<Health>(); hp.Max = type == EnemyType.Ogre ? 180 : (type == EnemyType.Archer ? 48 : 62); hp.ExperienceReward = type == EnemyType.Ogre ? 45 : 14; hp.Configure(hp.Max);
            go.AddComponent<WorldHealthBar>();
            hp.Died += EnemyDied;
            var color = type == EnemyType.Ogre ? new Color(.38f, .18f, .12f) : (type == EnemyType.Archer ? new Color(.5f, .18f, .5f) : new Color(.2f, .55f, .24f));
            int spriteIndex = type == EnemyType.Goblin ? 1 : (type == EnemyType.Archer ? 2 : 3);
            SpriteArt.CharacterVisual(go.transform, spriteIndex, type == EnemyType.Ogre ? 1.7f : 1.35f);
            go.AddComponent<EnemyController>().Configure(type, player);
            go.AddComponent<TargetMarker>();
            living++;
        }

        void EnemyDied(Health enemy)
        {
            living--;
            player.GetComponent<CharacterStats>().GainExperience(enemy.ExperienceReward);
            FloatingText.Create(enemy.transform.position + Vector3.up * 2.2f, $"+{enemy.ExperienceReward} XP", new Color(.35f, .9f, 1f));
        }

        public static void Restart() => SceneManager.LoadScene(SceneManager.GetActiveScene().buildIndex);
    }
}

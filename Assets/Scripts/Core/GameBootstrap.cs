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

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Boot()
        {
            if (FindFirstObjectByType<GameBootstrap>()) return;
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
            var cam = camGo.AddComponent<Camera>(); cam.fieldOfView = 48; cam.backgroundColor = new Color(.025f, .045f, .075f); cam.clearFlags = CameraClearFlags.SolidColor;
            camGo.transform.SetPositionAndRotation(new Vector3(0, 14, -14), Quaternion.Euler(43, 0, 0));
            new GameObject("Combat FX").AddComponent<CombatFX>();

            var light = new GameObject("Moon Key Light").AddComponent<Light>(); light.type = LightType.Directional; light.intensity = 1.25f; light.color = new Color(.68f, .78f, 1f); light.transform.rotation = Quaternion.Euler(48, -35, 0);
            var floor = RuntimeArt.Primitive("Ancient Arena", PrimitiveType.Cube, new Vector3(0, -.3f, 0), new Vector3(28, .6f, 20), new Color(.075f, .13f, .14f));
            floor.GetComponent<Renderer>().material.SetFloat("_Smoothness", .12f);
            for (int x = -12; x <= 12; x += 4) for (int z = -8; z <= 8; z += 4)
                RuntimeArt.Primitive("Rune tile", PrimitiveType.Cube, new Vector3(x, .015f, z), new Vector3(3.7f, .035f, 3.7f), ((x + z) / 4) % 2 == 0 ? new Color(.09f, .19f, .18f) : new Color(.075f, .16f, .17f));
            for (int i = 0; i < 16; i++)
            {
                float angle = i / 16f * Mathf.PI * 2; var pos = new Vector3(Mathf.Cos(angle) * 13.2f, 1.2f, Mathf.Sin(angle) * 9.2f);
                RuntimeArt.Primitive("Ruin pillar", PrimitiveType.Cylinder, pos, new Vector3(.65f, Random.Range(1.4f, 2.8f), .65f), new Color(.17f, .22f, .24f));
                var crystal = RuntimeArt.Primitive("Glow crystal", PrimitiveType.Cube, pos + Vector3.up * 1.5f, Vector3.one * .23f, new Color(.12f, .8f, .72f));
                crystal.transform.rotation = Quaternion.Euler(45, 30, 45); crystal.GetComponent<Renderer>().material = RuntimeArt.Material(new Color(.1f, .8f, .7f), true);
            }

            var p = new GameObject("Wayfarer"); p.transform.position = new Vector3(0, .65f, -2);
            var collider = p.AddComponent<CapsuleCollider>(); collider.height = 1.8f; collider.radius = .45f;
            var stats = p.AddComponent<CharacterStats>();
            var hp = p.AddComponent<Health>(); hp.IsPlayer = true;
            p.AddComponent<AbilitySystem>(); p.AddComponent<PlayerController>();
            RuntimeArt.CharacterVisual(p.transform, new Color(.12f, .43f, .72f));
            player = p.transform;
            new GameObject("HUD").AddComponent<GameHUD>().Initialize(p);
        }

        IEnumerator Waves()
        {
            yield return new WaitForSeconds(1.2f);
            while (player)
            {
                if (living == 0)
                {
                    wave++;
                    int count = Mathf.Min(3 + wave, 8);
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
            var go = new GameObject(type.ToString()); go.transform.position = new Vector3(Mathf.Cos(angle) * 10f, type == EnemyType.Ogre ? .9f : .55f, Mathf.Sin(angle) * 7f);
            var col = go.AddComponent<CapsuleCollider>(); col.height = type == EnemyType.Ogre ? 2.3f : 1.6f; col.radius = type == EnemyType.Ogre ? .72f : .42f;
            var hp = go.AddComponent<Health>(); hp.Max = type == EnemyType.Ogre ? 180 : (type == EnemyType.Archer ? 48 : 62); hp.ExperienceReward = type == EnemyType.Ogre ? 45 : 14; hp.Configure(hp.Max);
            hp.Died += EnemyDied;
            var color = type == EnemyType.Ogre ? new Color(.38f, .18f, .12f) : (type == EnemyType.Archer ? new Color(.5f, .18f, .5f) : new Color(.2f, .55f, .24f));
            RuntimeArt.CharacterVisual(go.transform, color, type == EnemyType.Ogre);
            go.AddComponent<EnemyController>().Configure(type, player);
            living++;
        }

        void EnemyDied(Health enemy)
        {
            living--;
            player.GetComponent<CharacterStats>().GainExperience(enemy.ExperienceReward);
        }

        public static void Restart() => SceneManager.LoadScene(SceneManager.GetActiveScene().buildIndex);
    }
}

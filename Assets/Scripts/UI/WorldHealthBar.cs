using UnityEngine;

namespace ClasslessRPG
{
    public sealed class WorldHealthBar : MonoBehaviour
    {
        Health health;
        Transform back, fill;
        void Start()
        {
            health = GetComponent<Health>();
            float height = BarHeight();
            back = RuntimeArt.Primitive("Health Back", PrimitiveType.Cube, transform.position + Vector3.up * height, new Vector3(1.15f, .1f, .05f), new Color(.12f, .08f, .08f), transform).transform;
            back.GetComponent<Collider>().enabled = false;
            fill = RuntimeArt.Primitive("Health Fill", PrimitiveType.Cube, back.position + Vector3.back * .04f, new Vector3(1.08f, .065f, .04f), health.IsPlayer ? new Color(.2f, .85f, .45f) : new Color(.9f, .2f, .16f), transform).transform;
            fill.GetComponent<Collider>().enabled = false;
        }
        void LateUpdate()
        {
            if (!fill || !health) return;
            float ratio = Mathf.Clamp01(health.Current / health.Max);
            var rotation = Camera.main.transform.rotation;
            float height = BarHeight();
            back.SetPositionAndRotation(transform.position + Vector3.up * height, rotation);
            fill.rotation = rotation;
            fill.localScale = new Vector3(1.08f * ratio, .065f, .04f);
            fill.position = back.position + back.right * ((ratio - 1f) * .54f) - back.forward * .04f;
        }
        float BarHeight()
        {
            if (health.IsPlayer) return 4.1f;
            var enemy = GetComponent<EnemyController>();
            return enemy && enemy.Type == EnemyType.Ogre ? 4.55f : 2.55f;
        }
    }
}

using UnityEngine;

namespace ClasslessRPG
{
    public sealed class WorldHealthBar : MonoBehaviour
    {
        Health health;
        Transform fill;
        void Start()
        {
            health = GetComponent<Health>();
            var back = RuntimeArt.Primitive("Health Back", PrimitiveType.Cube, transform.position + Vector3.up * 1.75f, new Vector3(1.15f, .1f, .05f), new Color(.12f, .08f, .08f), transform);
            back.GetComponent<Collider>().enabled = false;
            fill = RuntimeArt.Primitive("Health Fill", PrimitiveType.Cube, back.transform.position + Vector3.back * .04f, new Vector3(1.08f, .065f, .04f), health.IsPlayer ? new Color(.2f, .85f, .45f) : new Color(.9f, .2f, .16f), transform).transform;
            fill.GetComponent<Collider>().enabled = false;
        }
        void LateUpdate()
        {
            if (!fill || !health) return;
            float ratio = Mathf.Clamp01(health.Current / health.Max);
            fill.localScale = new Vector3(1.08f * ratio, .065f, .04f);
            fill.localPosition = new Vector3((ratio - 1f) * .54f, fill.localPosition.y, fill.localPosition.z);
        }
    }
}

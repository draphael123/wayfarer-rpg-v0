using UnityEngine;

namespace ClasslessRPG
{
    public static class RuntimeArt
    {
        public static Material Material(Color color, bool emissive = false)
        {
            var shader = Resources.Load<Shader>("PrototypeLit");
            var material = new Material(shader) { color = color };
            if (emissive && material.HasProperty("_EmissionColor"))
            {
                material.EnableKeyword("_EMISSION");
                material.SetColor("_EmissionColor", color * 2.2f);
            }
            return material;
        }

        public static GameObject Primitive(string name, PrimitiveType type, Vector3 position, Vector3 scale, Color color, Transform parent = null)
        {
            var go = GameObject.CreatePrimitive(type);
            go.name = name; go.transform.SetParent(parent); go.transform.position = position; go.transform.localScale = scale;
            go.GetComponent<Renderer>().material = Material(color);
            return go;
        }

        public static void CharacterVisual(Transform root, Color body, bool big = false)
        {
            float size = big ? 1.35f : 1f;
            Primitive("Body", PrimitiveType.Capsule, root.position + Vector3.up * .3f * size, new Vector3(.65f, .72f, .65f) * size, body, root).GetComponent<Collider>().enabled = false;
            Primitive("Head", PrimitiveType.Sphere, root.position + Vector3.up * 1.15f * size, Vector3.one * .55f * size, new Color(1f, .72f, .52f), root).GetComponent<Collider>().enabled = false;
            Primitive("Weapon", PrimitiveType.Cube, root.position + new Vector3(.48f, .65f, .22f) * size, new Vector3(.11f, .75f, .11f) * size, new Color(.8f, .9f, 1f), root).GetComponent<Collider>().enabled = false;
        }
    }
}

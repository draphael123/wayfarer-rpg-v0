using System;
using System.Collections;
using UnityEngine;

namespace ClasslessRPG
{
    public sealed class Health : MonoBehaviour
    {
        public float Max = 100f;
        public bool IsPlayer;
        public int ExperienceReward = 10;
        public float Current { get; private set; }
        public bool IsDead => Current <= 0f;
        public event Action<float, float> Changed;
        public event Action<Health> Died;
        Renderer[] renderers;
        Color[] baseColors;

        void Awake() { Current = Max; }

        public void Configure(float maximum)
        {
            Max = maximum;
            Current = maximum;
            Changed?.Invoke(Current, Max);
        }

        public void Damage(float amount, Vector3 hitPoint, Color effectColor)
        {
            if (IsDead) return;
            Current = Mathf.Max(0, Current - amount);
            Changed?.Invoke(Current, Max);
            CombatFX.Hit(hitPoint, effectColor, amount);
            AudioDirector.Play(GameSound.Hit, UnityEngine.Random.Range(.92f, 1.08f));
            StopAllCoroutines();
            StartCoroutine(Flash());
            if (Current <= 0)
            {
                Died?.Invoke(this);
                if (!IsPlayer) Destroy(gameObject, .18f);
            }
        }

        IEnumerator Flash()
        {
            renderers ??= GetComponentsInChildren<Renderer>();
            if (baseColors == null || baseColors.Length != renderers.Length)
            {
                baseColors = new Color[renderers.Length];
                for (int i = 0; i < renderers.Length; i++) baseColors[i] = renderers[i].material.color;
            }
            foreach (var r in renderers) r.material.color = Color.white;
            yield return new WaitForSeconds(.07f);
            for (int i = 0; i < renderers.Length; i++) if (renderers[i]) renderers[i].material.color = baseColors[i];
        }
    }
}

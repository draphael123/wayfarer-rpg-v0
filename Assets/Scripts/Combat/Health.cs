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
            GetComponentInChildren<SpriteBillboard>()?.Play(CharacterMotion.Hit);
            Changed?.Invoke(Current, Max);
            CombatFX.Hit(hitPoint, effectColor, amount);
            AudioDirector.Play(GameSound.Hit, UnityEngine.Random.Range(.92f, 1.08f));
            StopAllCoroutines();
            StartCoroutine(Flash());
            if (Current <= 0)
            {
                Died?.Invoke(this);
                if (!IsPlayer) StartCoroutine(DeathRoutine());
            }
        }

        public void Restore(float amount)
        {
            if (IsDead) return;
            Current = Mathf.Min(Max, Current + amount);
            Changed?.Invoke(Current, Max);
            CombatFX.Burst(transform.position + Vector3.up, new Color(.25f, 1f, .56f), .38f);
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

        IEnumerator DeathRoutine()
        {
            foreach (var collider in GetComponentsInChildren<Collider>()) collider.enabled = false;
            var originalScale = transform.localScale;
            float started = Time.time, duration = .42f;
            while (Time.time - started < duration)
            {
                float t = (Time.time - started) / duration;
                transform.localScale = Vector3.Lerp(originalScale, originalScale * .18f, t * t);
                transform.position += Vector3.up * Time.deltaTime * .35f;
                transform.rotation *= Quaternion.Euler(0, 0, Time.deltaTime * 70f);
                yield return null;
            }
            Destroy(gameObject);
        }
    }
}

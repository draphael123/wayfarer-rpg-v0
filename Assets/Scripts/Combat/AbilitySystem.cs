using System.Collections;
using UnityEngine;

namespace ClasslessRPG
{
    public enum AbilityId { BasicAttack, Dash, PowerStrike, Fireball }

    public sealed class AbilitySystem : MonoBehaviour
    {
        CharacterStats stats;
        PlayerController controller;
        float basicReady, dashReady, powerReady, fireReady;
        public float BasicCooldown => Mathf.Max(0, basicReady - Time.time);
        public float DashCooldown => Mathf.Max(0, dashReady - Time.time);
        public float PowerCooldown => Mathf.Max(0, powerReady - Time.time);
        public float FireCooldown => Mathf.Max(0, fireReady - Time.time);
        public bool PowerUnlocked => stats.Attributes.Strength >= 8;
        public bool FireUnlocked => stats.Attributes.Intelligence >= 10;

        void Awake()
        {
            stats = GetComponent<CharacterStats>();
            controller = GetComponent<PlayerController>();
        }

        public void UseBasic(Vector3 aim)
        {
            if (Time.time < basicReady) return;
            CharacterAnimation.Play(transform, CharacterMotion.BasicAttack);
            basicReady = Time.time + .48f / (1 + stats.Attributes.Dexterity * .025f);
            AudioDirector.Play(GameSound.Slash, Random.Range(.94f, 1.07f));
            Face(aim);
            Melee(stats.AttackDamage, 1.8f, 70f, new Color(1f, .83f, .35f));
        }

        public void UseDash(Vector3 aim)
        {
            if (Time.time < dashReady) return;
            CharacterAnimation.Play(transform, CharacterMotion.Dash);
            dashReady = Time.time + 2.4f / stats.CooldownRate;
            AudioDirector.Play(GameSound.Click, 1.25f);
            StartCoroutine(DashRoutine(aim));
        }

        public void UsePower(Vector3 aim)
        {
            if (!PowerUnlocked || Time.time < powerReady) return;
            CharacterAnimation.Play(transform, CharacterMotion.HeavyAttack);
            powerReady = Time.time + 4.5f / stats.CooldownRate;
            AudioDirector.Play(GameSound.Heavy);
            Face(aim);
            Melee(stats.AttackDamage * 2.4f, 2.25f, 110f, new Color(1f, .35f, .12f));
            CombatFX.Shake(.18f, .16f);
        }

        public void UseFireball(Vector3 aim)
        {
            if (!FireUnlocked || Time.time < fireReady) return;
            CharacterAnimation.Play(transform, CharacterMotion.Cast);
            fireReady = Time.time + 3.2f / stats.CooldownRate;
            AudioDirector.Play(GameSound.Fire);
            Face(aim);
            var orb = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            orb.name = "Fireball";
            orb.transform.position = transform.position + Vector3.up * .8f + transform.forward * .7f;
            orb.transform.localScale = Vector3.one * .45f;
            orb.GetComponent<Renderer>().material = RuntimeArt.Material(new Color(1f, .18f, .03f), true);
            Destroy(orb.GetComponent<Collider>());
            var projectile = orb.AddComponent<Projectile>();
            projectile.Direction = transform.forward;
            projectile.Damage = stats.SpellDamage * 1.7f;
        }

        void Face(Vector3 point)
        {
            var direction = point - transform.position; direction.y = 0;
            if (direction.sqrMagnitude > .01f) transform.rotation = Quaternion.LookRotation(direction);
        }

        void Melee(float damage, float radius, float angle, Color color)
        {
            CombatFX.Slash(transform.position + transform.forward, transform.rotation, color, radius);
            foreach (var hit in Physics.OverlapSphere(transform.position, radius))
            {
                var health = hit.GetComponentInParent<Health>();
                if (!health || health.IsPlayer || health.IsDead) continue;
                var to = health.transform.position - transform.position;
                if (Vector3.Angle(transform.forward, to) <= angle * .5f)
                    health.Damage(damage, health.transform.position + Vector3.up * .7f, color);
            }
        }

        IEnumerator DashRoutine(Vector3 aim)
        {
            Face(aim);
            controller.Enabled = false;
            float until = Time.time + .18f;
            while (Time.time < until)
            {
                transform.position += transform.forward * 12f * Time.deltaTime;
                CombatFX.Trail(transform.position + Vector3.up * .4f, new Color(.25f, .75f, 1f));
                yield return null;
            }
            controller.Enabled = true;
        }
    }

    public sealed class Projectile : MonoBehaviour
    {
        public Vector3 Direction;
        public float Damage;
        float born;
        void Start() { born = Time.time; }
        void Update()
        {
            transform.position += Direction * 9f * Time.deltaTime;
            transform.localScale = Vector3.one * (.4f + Mathf.Sin(Time.time * 18f) * .05f);
            foreach (var hit in Physics.OverlapSphere(transform.position, .45f))
            {
                var health = hit.GetComponentInParent<Health>();
                if (!health || health.IsPlayer || health.IsDead) continue;
                health.Damage(Damage, transform.position, new Color(1f, .2f, .02f));
                CombatFX.Burst(transform.position, new Color(1f, .2f, .02f), 1.4f);
                Destroy(gameObject); return;
            }
            if (Time.time - born > 3f) Destroy(gameObject);
        }
    }
}

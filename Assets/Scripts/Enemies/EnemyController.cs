using System.Collections;
using UnityEngine;

namespace ClasslessRPG
{
    public enum EnemyType { Goblin, Archer, Ogre }

    public sealed class EnemyController : MonoBehaviour
    {
        public EnemyType Type;
        public Transform Target;
        Health health;
        float speed, damage, range, cooldown, nextAttack;
        Vector3 home;
        bool attacking;

        public void Configure(EnemyType type, Transform target)
        {
            Type = type; Target = target; home = transform.position;
            health = GetComponent<Health>();
            switch (type)
            {
                case EnemyType.Goblin: speed = 2.85f; damage = 5; range = 1.3f; cooldown = 1.25f; break;
                case EnemyType.Archer: speed = 2.3f; damage = 4; range = 6.5f; cooldown = 1.9f; break;
                default: speed = 1.55f; damage = 12; range = 1.7f; cooldown = 2.35f; break;
            }
        }

        void Update()
        {
            if (!Target || health.IsDead || attacking) return;
            var playerHealth = Target.GetComponent<Health>();
            if (playerHealth.IsDead) return;
            var delta = Target.position - transform.position; delta.y = 0;
            float distance = delta.magnitude;
            if (distance < 11f)
            {
                transform.rotation = Quaternion.Slerp(transform.rotation, Quaternion.LookRotation(delta), Time.deltaTime * 8f);
                bool shouldMove = Type == EnemyType.Archer ? distance < 3.5f || distance > range : distance > range;
                if (shouldMove)
                {
                    float direction = Type == EnemyType.Archer && distance < 3.5f ? -1 : 1;
                    transform.position += delta.normalized * direction * speed * Time.deltaTime;
                }
                else if (Time.time >= nextAttack)
                {
                    nextAttack = Time.time + cooldown;
                    if (Type == EnemyType.Archer) Shoot(playerHealth);
                    else if (Type == EnemyType.Ogre) StartCoroutine(HeavyAttack(playerHealth));
                    else playerHealth.Damage(damage, Target.position + Vector3.up, new Color(.95f, .25f, .2f));
                }
            }
            else if ((transform.position - home).sqrMagnitude > 1f)
                transform.position = Vector3.MoveTowards(transform.position, home, speed * .5f * Time.deltaTime);
        }

        void Shoot(Health player)
        {
            var start = transform.position + Vector3.up * .7f;
            CombatFX.Line(start, player.transform.position + Vector3.up * .5f, new Color(1f, .45f, .15f));
            player.Damage(damage, player.transform.position + Vector3.up, new Color(1f, .3f, .15f));
        }

        IEnumerator HeavyAttack(Health player)
        {
            attacking = true;
            var sprite = GetComponentInChildren<SpriteRenderer>();
            if (sprite) sprite.color = new Color(1f, .5f, .28f);
            CombatFX.Burst(transform.position + Vector3.up * 1.4f, new Color(1f, .38f, .12f), .55f);
            yield return new WaitForSeconds(.55f);
            if (player && !player.IsDead && Vector3.Distance(transform.position, player.transform.position) <= range + .65f)
            {
                player.Damage(damage, player.transform.position + Vector3.up, new Color(1f, .22f, .08f));
                CombatFX.Shake(.22f, .16f);
            }
            if (sprite) sprite.color = Color.white;
            attacking = false;
        }
    }

    public sealed class TargetMarker : MonoBehaviour
    {
        GameObject ring;
        void Start()
        {
            ring = RuntimeArt.Primitive("Targeted enemy", PrimitiveType.Cylinder, transform.position + Vector3.down * .5f, new Vector3(.58f, .016f, .58f), new Color(.9f, .22f, .12f), transform);
            ring.GetComponent<Collider>().enabled = false;
            ring.SetActive(false);
        }
        public void SetSelected(bool selected) { if (ring) ring.SetActive(selected); }
    }
}

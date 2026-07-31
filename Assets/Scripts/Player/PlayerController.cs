using UnityEngine;

namespace ClasslessRPG
{
    [RequireComponent(typeof(CharacterStats), typeof(Health), typeof(AbilitySystem))]
    public sealed class PlayerController : MonoBehaviour
    {
        public bool Enabled = true;
        CharacterStats stats;
        AbilitySystem abilities;
        Health health;
        Camera cam;
        public Vector3 AimPoint { get; private set; }

        void Start()
        {
            stats = GetComponent<CharacterStats>();
            abilities = GetComponent<AbilitySystem>();
            health = GetComponent<Health>();
            cam = Camera.main;
            health.IsPlayer = true;
            health.Configure(stats.MaxHealth);
        }

        void Update()
        {
            if (health.IsDead) { if (Input.GetKeyDown(KeyCode.R)) GameBootstrap.Restart(); return; }
            var plane = new Plane(Vector3.up, Vector3.zero);
            var ray = cam.ScreenPointToRay(Input.mousePosition);
            if (plane.Raycast(ray, out float enter)) AimPoint = ray.GetPoint(enter);

            if (Enabled)
            {
                var move = new Vector3(Input.GetAxisRaw("Horizontal"), 0, Input.GetAxisRaw("Vertical")).normalized;
                transform.position += move * stats.MoveSpeed * Time.deltaTime;
                transform.position = new Vector3(Mathf.Clamp(transform.position.x, -12.5f, 12.5f), .65f, Mathf.Clamp(transform.position.z, -8.5f, 8.5f));
                if (move.sqrMagnitude > .01f) transform.rotation = Quaternion.Slerp(transform.rotation, Quaternion.LookRotation(move), Time.deltaTime * 12f);
            }

            if (Input.GetMouseButton(0)) abilities.UseBasic(AimPoint);
            if (Input.GetKeyDown(KeyCode.Space)) abilities.UseDash(AimPoint);
            if (Input.GetKeyDown(KeyCode.Q)) abilities.UsePower(AimPoint);
            if (Input.GetKeyDown(KeyCode.E)) abilities.UseFireball(AimPoint);
            if (Input.GetKeyDown(KeyCode.Alpha1)) Allocate(AttributeType.Strength);
            if (Input.GetKeyDown(KeyCode.Alpha2)) Allocate(AttributeType.Dexterity);
            if (Input.GetKeyDown(KeyCode.Alpha3)) Allocate(AttributeType.Intelligence);
            if (Input.GetKeyDown(KeyCode.Alpha4)) Allocate(AttributeType.Vitality);
            if (Input.GetKeyDown(KeyCode.Alpha5)) Allocate(AttributeType.Spirit);
        }

        void Allocate(AttributeType type)
        {
            if (!stats.SpendPoint(type)) return;
            if (type == AttributeType.Vitality) health.Configure(stats.MaxHealth);
            CombatFX.Burst(transform.position + Vector3.up, new Color(.3f, 1f, .65f), .9f);
        }
    }
}

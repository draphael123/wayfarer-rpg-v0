using UnityEngine;
using UnityEngine.EventSystems;

namespace ClasslessRPG
{
    [RequireComponent(typeof(CharacterStats), typeof(Health), typeof(AbilitySystem))]
    public sealed class PlayerController : MonoBehaviour
    {
        public static PlayerController Selected { get; private set; }
        public bool Enabled = true;
        CharacterStats stats;
        AbilitySystem abilities;
        Health health;
        Camera cam;
        public Vector3 AimPoint { get; private set; }
        public Health CombatTarget { get; private set; }
        public bool IsSelected { get; private set; }
        Vector3 destination;
        bool dragging;
        float nextStep;
        LineRenderer commandLine;
        Vector3 dragPoint;
        public bool PowerQueued { get; private set; }

        void Start()
        {
            stats = GetComponent<CharacterStats>();
            abilities = GetComponent<AbilitySystem>();
            health = GetComponent<Health>();
            cam = Camera.main;
            destination = transform.position;
            health.IsPlayer = true;
            health.Configure(stats.MaxHealth);
            commandLine = new GameObject("Command tether").AddComponent<LineRenderer>();
            commandLine.transform.SetParent(transform, false);
            commandLine.positionCount = 2; commandLine.startWidth = .08f; commandLine.endWidth = .035f;
            commandLine.material = RuntimeArt.Material(new Color(1f, .85f, .3f), true);
            commandLine.useWorldSpace = true; commandLine.sortingOrder = 40; commandLine.numCapVertices = 5;
            commandLine.enabled = false;
            if (!Selected) SelectUnit();
        }

        void Update()
        {
            if (Time.timeScale == 0) return;
            if (health.IsDead) { if (Input.GetKeyDown(KeyCode.R)) GameBootstrap.Restart(); return; }
            var plane = new Plane(Vector3.up, Vector3.zero);
            var ray = cam.ScreenPointToRay(Input.mousePosition);
            if (plane.Raycast(ray, out float enter)) AimPoint = ray.GetPoint(enter);

            if (Enabled)
            {
                if (Input.GetMouseButtonDown(0) && !(EventSystem.current && EventSystem.current.IsPointerOverGameObject()))
                {
                    if (Physics.Raycast(ray, out var hit, 100f))
                    {
                        var clickedHealth = hit.collider.GetComponentInParent<Health>();
                        if (clickedHealth && !clickedHealth.IsPlayer) SelectTarget(clickedHealth);
                        else if (clickedHealth == health) { SelectUnit(); dragging = true; dragPoint = transform.position; commandLine.enabled = true; }
                        else { SelectTarget(null); destination = AimPoint; }
                    }
                }
                if (dragging && Input.GetMouseButton(0))
                {
                    dragPoint = AimPoint; SelectTarget(null);
                    commandLine.SetPosition(0, transform.position + Vector3.up * 1.05f);
                    commandLine.SetPosition(1, dragPoint + Vector3.up * .08f);
                }
                if (Input.GetMouseButtonUp(0) && dragging)
                {
                    dragging = false; commandLine.enabled = false;
                    bool assignedTarget = false;
                    if (Physics.Raycast(ray, out var releaseHit, 100f))
                    {
                        var releasedHealth = releaseHit.collider.GetComponentInParent<Health>();
                        if (releasedHealth && !releasedHealth.IsPlayer) { SelectTarget(releasedHealth); assignedTarget = true; }
                    }
                    if (!assignedTarget) destination = dragPoint;
                }

                if (CombatTarget && !CombatTarget.IsDead)
                {
                    destination = CombatTarget.transform.position;
                    float distance = Vector3.Distance(transform.position, destination);
                    if (distance <= 1.65f)
                    {
                        if (PowerQueued) { abilities.UsePower(CombatTarget.transform.position); PowerQueued = false; }
                        else abilities.UseBasic(CombatTarget.transform.position);
                        destination = transform.position;
                    }
                }
                else if (CombatTarget && CombatTarget.IsDead) SelectTarget(null);

                var delta = destination - transform.position; delta.y = 0;
                var move = delta.magnitude > .12f ? delta.normalized : Vector3.zero;
                transform.position += move * stats.MoveSpeed * Time.deltaTime;
                if (move.sqrMagnitude > .01f && Time.time >= nextStep)
                {
                    nextStep = Time.time + .34f;
                    AudioDirector.Play(GameSound.Step, Random.Range(.94f, 1.06f));
                }
                transform.position = new Vector3(Mathf.Clamp(transform.position.x, -11.5f, 11.5f), .65f, Mathf.Clamp(transform.position.z, -3.1f, 3.1f));
                if (move.sqrMagnitude > .01f) transform.rotation = Quaternion.Slerp(transform.rotation, Quaternion.LookRotation(move), Time.deltaTime * 12f);
            }

            if (Input.GetKeyDown(KeyCode.Space)) CastDash();
            if (Input.GetKeyDown(KeyCode.Q)) CastPower();
            if (Input.GetKeyDown(KeyCode.E)) CastFireball();
            if (Input.GetKeyDown(KeyCode.Alpha1)) Allocate(AttributeType.Strength);
            if (Input.GetKeyDown(KeyCode.Alpha2)) Allocate(AttributeType.Dexterity);
            if (Input.GetKeyDown(KeyCode.Alpha3)) Allocate(AttributeType.Intelligence);
            if (Input.GetKeyDown(KeyCode.Alpha4)) Allocate(AttributeType.Vitality);
            if (Input.GetKeyDown(KeyCode.Alpha5)) Allocate(AttributeType.Spirit);
        }

        void SelectUnit()
        {
            if (Selected && Selected != this) Selected.IsSelected = false;
            Selected = this;
            IsSelected = true;
            AudioDirector.Play(GameSound.Click, 1.18f);
        }

        void SelectTarget(Health target)
        {
            if (CombatTarget) CombatTarget.GetComponent<TargetMarker>()?.SetSelected(false);
            CombatTarget = target;
            if (!CombatTarget) PowerQueued = false;
            if (CombatTarget)
            {
                CombatTarget.GetComponent<TargetMarker>()?.SetSelected(true);
                CombatFX.Burst(CombatTarget.transform.position + Vector3.up * .4f, new Color(1f, .72f, .2f), .32f);
                AudioDirector.Play(GameSound.Click, 1.12f);
            }
        }

        public void CastDash() { if (Selected == this) abilities.UseDash(CombatTarget ? CombatTarget.transform.position : AimPoint); }
        public void CastPower()
        {
            if (Selected != this || !abilities.PowerUnlocked || abilities.PowerCooldown > 0) return;
            if (CombatTarget && Vector3.Distance(transform.position, CombatTarget.transform.position) > 1.75f)
            {
                PowerQueued = true;
                destination = CombatTarget.transform.position;
                AudioDirector.Play(GameSound.Click, .9f);
            }
            else abilities.UsePower(CombatTarget ? CombatTarget.transform.position : AimPoint);
        }
        public void CastFireball() { if (Selected == this) abilities.UseFireball(CombatTarget ? CombatTarget.transform.position : AimPoint); }

        void Allocate(AttributeType type)
        {
            if (!stats.SpendPoint(type)) return;
            if (type == AttributeType.Vitality) health.Configure(stats.MaxHealth);
            CombatFX.Burst(transform.position + Vector3.up, new Color(.3f, 1f, .65f), .9f);
        }
    }
}

using UnityEngine;
using UnityEngine.UI;

namespace ClasslessRPG
{
    public sealed class GameHUD : MonoBehaviour
    {
        CharacterStats stats;
        Health health;
        AbilitySystem abilities;
        Text left, right, banner;

        public void Initialize(GameObject player)
        {
            stats = player.GetComponent<CharacterStats>(); health = player.GetComponent<Health>(); abilities = player.GetComponent<AbilitySystem>();
            var canvas = gameObject.AddComponent<Canvas>(); canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            gameObject.AddComponent<CanvasScaler>().uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            gameObject.AddComponent<GraphicRaycaster>();
            left = Label("Vitals", new Vector2(22, -20), new Vector2(.47f, .42f), TextAnchor.UpperLeft, 20);
            right = Label("Build", new Vector2(-22, -20), new Vector2(.47f, .38f), TextAnchor.UpperRight, 18, true);
            banner = Label("Banner", new Vector2(0, -16), new Vector2(.7f, .12f), TextAnchor.UpperCenter, 24);
        }

        Text Label(string name, Vector2 pos, Vector2 size, TextAnchor anchor, int fontSize, bool fromRight = false)
        {
            var go = new GameObject(name); go.transform.SetParent(transform, false);
            var text = go.AddComponent<Text>(); text.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf"); text.fontSize = fontSize; text.fontStyle = FontStyle.Bold; text.alignment = anchor; text.color = new Color(.94f, .96f, 1f);
            text.horizontalOverflow = HorizontalWrapMode.Wrap; text.verticalOverflow = VerticalWrapMode.Overflow;
            text.rectTransform.anchorMin = fromRight ? Vector2.one : new Vector2(0, 1); text.rectTransform.anchorMax = text.rectTransform.anchorMin;
            text.rectTransform.pivot = fromRight ? Vector2.one : new Vector2(0, 1); text.rectTransform.anchoredPosition = pos; text.rectTransform.sizeDelta = new Vector2(Screen.width * size.x, Screen.height * size.y);
            var shadow = go.AddComponent<Shadow>(); shadow.effectColor = new Color(0, 0, 0, .85f); shadow.effectDistance = new Vector2(2, -2);
            return text;
        }

        void Update()
        {
            if (!stats) return;
            left.text = $"<size=26>WAYFARER</size>   Lv {stats.Level}\nHP  {Mathf.CeilToInt(health.Current)} / {Mathf.CeilToInt(health.Max)}\nXP  {stats.Experience} / {stats.ExperienceToNext}\n\n<size=16>WASD move   Mouse aim / attack\nSPACE dash   Q power strike   E fireball</size>";
            string power = abilities.PowerUnlocked ? Cooldown(abilities.PowerCooldown) : $"LOCKED — needs STR 8";
            string fire = abilities.FireUnlocked ? Cooldown(abilities.FireCooldown) : $"LOCKED — needs INT 10";
            right.text = $"<size=24>ATTRIBUTES</size>   {stats.AttributePoints} points\n[1] Strength       {stats.Attributes.Strength}\n[2] Dexterity      {stats.Attributes.Dexterity}\n[3] Intelligence   {stats.Attributes.Intelligence}\n[4] Vitality       {stats.Attributes.Vitality}\n[5] Spirit         {stats.Attributes.Spirit}\n\nQ  POWER STRIKE  {power}\nE  FIREBALL       {fire}";
            banner.text = health.IsDead ? "<color=#ff6655>YOU FELL</color>\n<size=16>Press R to return to the arena</size>" : (stats.AttributePoints > 0 ? $"<color=#63ffc2>LEVEL UP — {stats.AttributePoints} ATTRIBUTE POINTS</color>\n<size=15>Press 1–5 to invest</size>" : "");
        }
        string Cooldown(float time) => time <= 0 ? "<color=#63ffc2>READY</color>" : $"{time:0.0}s";
    }
}

using UnityEngine;
using UnityEngine.UI;
using UnityEngine.EventSystems;

namespace ClasslessRPG
{
    public sealed class GameHUD : MonoBehaviour
    {
        static readonly Color Ink = new(.09f, .075f, .065f, .96f);
        static readonly Color Parchment = new(.84f, .73f, .52f, .96f);
        static readonly Color Brass = new(.82f, .58f, .22f, 1f);
        static readonly Color Cream = new(.97f, .91f, .75f, 1f);
        CharacterStats stats; Health health; AbilitySystem abilities; PlayerController controller;
        Text heroText, buildText, banner, dashLabel, powerLabel, fireLabel;
        Image hpFill, xpFill, portraitFrame, dashPlate, powerPlate, firePlate;
        GameObject settingsPanel;

        public void Initialize(GameObject player)
        {
            stats = player.GetComponent<CharacterStats>(); health = player.GetComponent<Health>(); abilities = player.GetComponent<AbilitySystem>(); controller = player.GetComponent<PlayerController>();
            var canvas = gameObject.AddComponent<Canvas>(); canvas.renderMode = RenderMode.ScreenSpaceOverlay; canvas.sortingOrder = 100;
            var scaler = gameObject.AddComponent<CanvasScaler>(); scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize; scaler.referenceResolution = new Vector2(1280, 720); scaler.matchWidthOrHeight = .5f;
            gameObject.AddComponent<GraphicRaycaster>();
            if (!EventSystem.current) { var events = new GameObject("Event System"); events.AddComponent<EventSystem>(); events.AddComponent<StandaloneInputModule>(); }

            CreateHeroCard();
            CreateCommandRail();
            CreateBuildCard();
            CreateSettings();
            banner = TextLabel("Banner", transform, "", 28, TextAnchor.UpperCenter, Cream);
            SetRect(banner.rectTransform, new Vector2(.5f, 1), new Vector2(.5f, 1), new Vector2(0, -24), new Vector2(700, 110), new Vector2(.5f, 1));
        }

        void CreateHeroCard()
        {
            var panel = Panel("Hero card", transform, new Color(.08f, .10f, .11f, .94f));
            SetRect(panel, new Vector2(0, 1), new Vector2(0, 1), new Vector2(18, -18), new Vector2(332, 126), new Vector2(0, 1));
            AddBorder(panel.transform, Brass, 3);
            var portrait = new GameObject("Selected hero portrait", typeof(RectTransform), typeof(Image)); portrait.transform.SetParent(panel.transform, false);
            var portraitImage = portrait.GetComponent<Image>(); portraitImage.sprite = SpriteArt.Character(0); portraitImage.preserveAspect = true; portraitImage.color = Color.white;
            SetRect(portrait.GetComponent<RectTransform>(), new Vector2(0, .5f), new Vector2(0, .5f), new Vector2(56, 0), new Vector2(104, 110), new Vector2(.5f, .5f));
            portraitFrame = portraitImage;
            heroText = TextLabel("Hero identity", panel.transform, "WAYFARER", 18, TextAnchor.UpperLeft, Cream);
            SetRect(heroText.rectTransform, new Vector2(0, 1), new Vector2(0, 1), new Vector2(116, -12), new Vector2(196, 48), new Vector2(0, 1));
            hpFill = Bar(panel.transform, new Vector2(116, -58), new Color(.75f, .16f, .13f));
            xpFill = Bar(panel.transform, new Vector2(116, -88), new Color(.2f, .68f, .72f));
        }

        void CreateCommandRail()
        {
            var rail = Panel("Command rail", transform, Ink);
            SetRect(rail, new Vector2(.5f, 0), new Vector2(.5f, 0), new Vector2(0, 14), new Vector2(560, 108), new Vector2(.5f, 0));
            AddBorder(rail.transform, Brass, 4);
            TextLabel("Command title", rail.transform, "SELECTED HERO  •  COMMANDS", 13, TextAnchor.UpperCenter, Parchment).rectTransform.SetInsetAndSizeFromParentEdge(RectTransform.Edge.Top, 5, 22);
            CreateAbility(rail.transform, "DASH", "SPACE", new Vector2(-176, 10), new Color(.13f, .54f, .76f), controller.CastDash, out dashPlate, out dashLabel);
            CreateAbility(rail.transform, "POWER STRIKE", "Q", new Vector2(0, 10), new Color(.78f, .25f, .12f), controller.CastPower, out powerPlate, out powerLabel);
            CreateAbility(rail.transform, "FIREBALL", "E", new Vector2(176, 10), new Color(.46f, .2f, .68f), controller.CastFireball, out firePlate, out fireLabel);
        }

        void CreateAbility(Transform parent, string title, string key, Vector2 pos, Color color, UnityEngine.Events.UnityAction action, out Image plate, out Text label)
        {
            var go = new GameObject(title, typeof(RectTransform), typeof(Image), typeof(Button)); go.transform.SetParent(parent, false);
            plate = go.GetComponent<Image>(); plate.color = color;
            var button = go.GetComponent<Button>(); button.targetGraphic = plate; button.onClick.AddListener(() => { AudioDirector.Play(GameSound.Click); action(); });
            SetRect(go.GetComponent<RectTransform>(), new Vector2(.5f, 0), new Vector2(.5f, 0), pos, new Vector2(164, 68), new Vector2(.5f, 0));
            AddBorder(go.transform, new Color(1f, .84f, .46f, .9f), 2);
            label = TextLabel("Ability label", go.transform, $"<size=12>[{key}]</size>\n{title}", 16, TextAnchor.MiddleCenter, Color.white);
            Stretch(label.rectTransform, 4);
        }

        void CreateBuildCard()
        {
            var panel = Panel("Build card", transform, new Color(.08f, .10f, .11f, .9f));
            SetRect(panel, new Vector2(1, 1), new Vector2(1, 1), new Vector2(-18, -76), new Vector2(260, 230), new Vector2(1, 1));
            AddBorder(panel.transform, new Color(.55f, .42f, .24f, 1), 2);
            buildText = TextLabel("Attributes", panel.transform, "", 16, TextAnchor.UpperLeft, Cream); Stretch(buildText.rectTransform, 14);
        }

        void CreateSettings()
        {
            var settingsButton = Button("Settings", transform, "⚙  SETTINGS", new Color(.13f, .16f, .17f, .95f), ToggleSettings);
            SetRect(settingsButton.GetComponent<RectTransform>(), Vector2.one, Vector2.one, new Vector2(-18, -18), new Vector2(154, 42), Vector2.one);

            settingsPanel = Panel("Settings overlay", transform, new Color(.025f, .03f, .035f, .96f)).gameObject;
            SetRect(settingsPanel.GetComponent<RectTransform>(), new Vector2(.5f, .5f), new Vector2(.5f, .5f), Vector2.zero, new Vector2(470, 390), new Vector2(.5f, .5f));
            AddBorder(settingsPanel.transform, Brass, 4);
            var title = TextLabel("Title", settingsPanel.transform, "FIELD SETTINGS", 28, TextAnchor.UpperCenter, Cream); SetRect(title.rectTransform, new Vector2(.5f, 1), new Vector2(.5f, 1), new Vector2(0, -28), new Vector2(400, 52), new Vector2(.5f, 1));
            var help = TextLabel("Help", settingsPanel.transform, "Drag hero to move  •  Click foes to attack\nSPACE Dash   •   Q Power Strike   •   E Fireball", 16, TextAnchor.UpperCenter, Parchment); SetRect(help.rectTransform, new Vector2(.5f, 1), new Vector2(.5f, 1), new Vector2(0, -92), new Vector2(410, 70), new Vector2(.5f, 1));
            CreateSlider(settingsPanel.transform, "MASTER VOLUME", new Vector2(0, -10), AudioDirector.MasterVolume, value => AudioDirector.MasterVolume = value);
            CreateSlider(settingsPanel.transform, "AMBIENCE", new Vector2(0, -80), AudioDirector.MusicVolume, value => AudioDirector.MusicVolume = value);
            var resume = Button("Resume", settingsPanel.transform, "RETURN TO BATTLE", new Color(.28f, .48f, .3f, 1), ToggleSettings); SetRect(resume.GetComponent<RectTransform>(), new Vector2(.5f, 0), new Vector2(.5f, 0), new Vector2(0, 28), new Vector2(250, 52), new Vector2(.5f, 0));
            settingsPanel.SetActive(false);
        }

        void CreateSlider(Transform parent, string title, Vector2 position, float value, UnityEngine.Events.UnityAction<float> change)
        {
            var text = TextLabel(title, parent, title, 15, TextAnchor.MiddleLeft, Cream); SetRect(text.rectTransform, new Vector2(.5f, .5f), new Vector2(.5f, .5f), position + new Vector2(-120, 22), new Vector2(240, 26), new Vector2(.5f, .5f));
            var sliderGo = new GameObject(title + " slider", typeof(RectTransform), typeof(Slider)); sliderGo.transform.SetParent(parent, false); SetRect(sliderGo.GetComponent<RectTransform>(), new Vector2(.5f, .5f), new Vector2(.5f, .5f), position + new Vector2(0, -4), new Vector2(300, 22), new Vector2(.5f, .5f));
            var bg = Panel("Track", sliderGo.transform, new Color(.12f, .1f, .08f, 1)); Stretch(bg, 2);
            var fillArea = new GameObject("Fill Area", typeof(RectTransform)); fillArea.transform.SetParent(sliderGo.transform, false); Stretch(fillArea.GetComponent<RectTransform>(), 4);
            var fill = Panel("Fill", fillArea.transform, Brass); Stretch(fill, 0);
            var slider = sliderGo.GetComponent<Slider>(); slider.fillRect = fill.rectTransform; slider.minValue = 0; slider.maxValue = 1; slider.value = value; slider.onValueChanged.AddListener(change);
        }

        void ToggleSettings()
        {
            bool open = !settingsPanel.activeSelf; settingsPanel.SetActive(open); Time.timeScale = open ? 0 : 1; AudioDirector.Play(GameSound.Click);
        }

        void Update()
        {
            if (!stats) return;
            if (Input.GetKeyDown(KeyCode.Escape)) ToggleSettings();
            heroText.text = $"<b>WAYFARER</b>  <color=#D39A3B>LV {stats.Level}</color>\n<size=13>HP {Mathf.CeilToInt(health.Current)} / {Mathf.CeilToInt(health.Max)}</size>";
            hpFill.fillAmount = health.Current / health.Max; xpFill.fillAmount = stats.Experience / (float)stats.ExperienceToNext;
            portraitFrame.color = controller.IsSelected ? Color.white : new Color(.45f, .45f, .45f);
            buildText.text = $"<size=19><b>ATTRIBUTES</b></size>  <color=#E1B45C>{stats.AttributePoints} points</color>\n\n[1]  Strength        {stats.Attributes.Strength}\n[2]  Dexterity       {stats.Attributes.Dexterity}\n[3]  Intelligence   {stats.Attributes.Intelligence}\n[4]  Vitality          {stats.Attributes.Vitality}\n[5]  Spirit             {stats.Attributes.Spirit}\n\n<size=12>Spend points with keys 1–5</size>";
            SetAbility(dashPlate, dashLabel, "<size=12>[SPACE]</size>\nDASH", abilities.DashCooldown, true);
            SetAbility(powerPlate, powerLabel, abilities.PowerUnlocked ? "<size=12>[Q]</size>\nPOWER STRIKE" : "<size=12>[Q]  STR 8</size>\nLOCKED", abilities.PowerCooldown, abilities.PowerUnlocked);
            SetAbility(firePlate, fireLabel, abilities.FireUnlocked ? "<size=12>[E]</size>\nFIREBALL" : "<size=12>[E]  INT 10</size>\nLOCKED", abilities.FireCooldown, abilities.FireUnlocked);
            banner.text = health.IsDead ? "<color=#FF765F>THE WAYFARER HAS FALLEN</color>\n<size=16>Press R to return</size>" : (stats.AttributePoints > 0 ? $"<color=#F2C45F>LEVEL UP  •  {stats.AttributePoints} ATTRIBUTE POINTS</color>" : "");
        }

        void SetAbility(Image plate, Text label, string title, float cooldown, bool unlocked)
        {
            plate.color = unlocked ? new Color(plate.color.r, plate.color.g, plate.color.b, cooldown <= 0 ? 1f : .48f) : new Color(.2f, .19f, .18f, .9f);
            label.text = cooldown > 0 ? $"<size=21>{cooldown:0.0}</size>\n<size=11>RECOVERING</size>" : title;
        }

        Image Bar(Transform parent, Vector2 pos, Color color)
        {
            var back = Panel("Bar back", parent, new Color(.05f, .045f, .04f, 1)); SetRect(back, new Vector2(0, 1), new Vector2(0, 1), pos, new Vector2(190, 16), new Vector2(0, 1));
            var fill = Panel("Bar fill", back.transform, color); Stretch(fill, 2); fill.type = Image.Type.Filled; fill.fillMethod = Image.FillMethod.Horizontal; fill.fillOrigin = 0; return fill;
        }
        static Image Panel(string name, Transform parent, Color color) { var go = new GameObject(name, typeof(RectTransform), typeof(Image)); go.transform.SetParent(parent, false); var image = go.GetComponent<Image>(); image.color = color; return image; }
        static GameObject Button(string name, Transform parent, string copy, Color color, UnityEngine.Events.UnityAction action) { var image = Panel(name, parent, color); var button = image.gameObject.AddComponent<Button>(); button.targetGraphic = image; button.onClick.AddListener(action); var label = TextLabel("Label", image.transform, copy, 15, TextAnchor.MiddleCenter, Cream); Stretch(label.rectTransform, 2); return image.gameObject; }
        static Text TextLabel(string name, Transform parent, string copy, int size, TextAnchor anchor, Color color) { var go = new GameObject(name, typeof(RectTransform), typeof(Text)); go.transform.SetParent(parent, false); var t = go.GetComponent<Text>(); t.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf"); t.text = copy; t.fontSize = size; t.fontStyle = FontStyle.Bold; t.alignment = anchor; t.color = color; t.supportRichText = true; return t; }
        static void AddBorder(Transform parent, Color color, float thickness) { var outline = parent.gameObject.AddComponent<Outline>(); outline.effectColor = color; outline.effectDistance = new Vector2(thickness, -thickness); }
        static void AddBorder(Image image, Color color, float thickness) => AddBorder(image.transform, color, thickness);
        static void Stretch(RectTransform rect, float inset) { rect.anchorMin = Vector2.zero; rect.anchorMax = Vector2.one; rect.offsetMin = Vector2.one * inset; rect.offsetMax = Vector2.one * -inset; }
        static void Stretch(Image image, float inset) => Stretch(image.rectTransform, inset);
        static void SetRect(RectTransform rect, Vector2 min, Vector2 max, Vector2 position, Vector2 size, Vector2 pivot) { rect.anchorMin = min; rect.anchorMax = max; rect.pivot = pivot; rect.anchoredPosition = position; rect.sizeDelta = size; }
        static void SetRect(Image image, Vector2 min, Vector2 max, Vector2 position, Vector2 size, Vector2 pivot) => SetRect(image.rectTransform, min, max, position, size, pivot);
    }
}

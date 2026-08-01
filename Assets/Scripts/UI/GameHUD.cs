using UnityEngine;
using UnityEngine.UI;
using UnityEngine.EventSystems;

namespace ClasslessRPG
{
    public sealed class GameHUD : MonoBehaviour
    {
        static readonly Color Ink = new(.17f, .105f, .055f, .97f);
        static readonly Color Parchment = new(.91f, .78f, .52f, .98f);
        static readonly Color Brass = new(.68f, .38f, .12f, 1f);
        static readonly Color Cream = new(1f, .94f, .72f, 1f);
        CharacterStats stats; Health health; AbilitySystem abilities; PlayerController controller; RiggedHeroVisual heroVisual;
        Text heroText, buildText, banner, waveLabel, targetText, tutorialText, dashLabel, powerLabel, fireLabel;
        Text shakeLabel;
        Image hpFill, xpFill, portraitFrame, dashPlate, powerPlate, firePlate;
        GameObject settingsPanel, startPanel, defeatPanel;
        bool battleStarted;

        public void Initialize(GameObject player)
        {
            stats = player.GetComponent<CharacterStats>(); health = player.GetComponent<Health>(); abilities = player.GetComponent<AbilitySystem>(); controller = player.GetComponent<PlayerController>(); heroVisual = player.GetComponentInChildren<RiggedHeroVisual>();
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
            waveLabel = TextLabel("Wave announcement", transform, "", 34, TextAnchor.MiddleCenter, Cream);
            SetRect(waveLabel.rectTransform, new Vector2(.5f, .62f), new Vector2(.5f, .62f), Vector2.zero, new Vector2(520, 90), new Vector2(.5f, .5f));
            targetText = TextLabel("Target identity", transform, "", 16, TextAnchor.UpperCenter, Cream);
            SetRect(targetText.rectTransform, new Vector2(.5f, 1), new Vector2(.5f, 1), new Vector2(0, -76), new Vector2(340, 52), new Vector2(.5f, 1));
            tutorialText = TextLabel("First battle help", transform, "DRAG FROM THE HERO TO MOVE   •   DRAG TO A FOE TO ATTACK   •   SPACE / Q / E USE ABILITIES", 14, TextAnchor.MiddleCenter, Parchment);
            SetRect(tutorialText.rectTransform, new Vector2(.5f, 0), new Vector2(.5f, 0), new Vector2(145, 108), new Vector2(760, 30), new Vector2(.5f, 0));
            Invoke(nameof(ClearTutorial), 9f);
            CreateStartScreen();
            CreateDefeatScreen();
        }

        void CreateHeroCard()
        {
            var panel = Panel("Hero card", transform, new Color(.24f, .14f, .07f, .97f));
            SetRect(panel, Vector2.zero, Vector2.zero, new Vector2(16, 14), new Vector2(330, 94), Vector2.zero);
            AddBorder(panel.transform, new Color(.92f, .7f, .3f), 3);
            var portrait = new GameObject("Selected hero portrait", typeof(RectTransform), typeof(Image)); portrait.transform.SetParent(panel.transform, false);
            var portraitImage = portrait.GetComponent<Image>(); portraitImage.sprite = HeroPartArt.Available ? HeroPartArt.Get(HeroPart.Head) : SpriteArt.Character(0); portraitImage.preserveAspect = true; portraitImage.color = Color.white;
            SetRect(portrait.GetComponent<RectTransform>(), new Vector2(0, .5f), new Vector2(0, .5f), new Vector2(48, 0), new Vector2(86, 88), new Vector2(.5f, .5f));
            portraitFrame = portraitImage;
            heroText = TextLabel("Hero identity", panel.transform, "WAYFARER", 18, TextAnchor.UpperLeft, Cream);
            SetRect(heroText.rectTransform, new Vector2(0, 1), new Vector2(0, 1), new Vector2(94, -9), new Vector2(222, 42), new Vector2(0, 1));
            hpFill = Bar(panel.transform, new Vector2(94, -49), new Color(.73f, .12f, .09f));
            xpFill = Bar(panel.transform, new Vector2(94, -72), new Color(.19f, .58f, .64f));
        }

        void CreateCommandRail()
        {
            var rail = Panel("Command rail", transform, Ink);
            SetRect(rail, new Vector2(.5f, 0), new Vector2(.5f, 0), new Vector2(165, 14), new Vector2(520, 94), new Vector2(.5f, 0));
            AddBorder(rail.transform, new Color(.92f, .7f, .3f), 3);
            TextLabel("Command title", rail.transform, "SELECTED HERO  •  COMMANDS", 13, TextAnchor.UpperCenter, Parchment).rectTransform.SetInsetAndSizeFromParentEdge(RectTransform.Edge.Top, 5, 22);
            CreateAbility(rail.transform, 0, "DASH", "SPACE", new Vector2(-164, 8), new Color(.16f, .45f, .56f), controller.CastDash, out dashPlate, out dashLabel);
            CreateAbility(rail.transform, 1, "POWER STRIKE", "Q", new Vector2(0, 8), new Color(.65f, .25f, .1f), controller.CastPower, out powerPlate, out powerLabel);
            CreateAbility(rail.transform, 2, "FIREBALL", "E", new Vector2(164, 8), new Color(.45f, .22f, .4f), controller.CastFireball, out firePlate, out fireLabel);
        }

        void CreateAbility(Transform parent, int iconIndex, string title, string key, Vector2 pos, Color color, UnityEngine.Events.UnityAction action, out Image plate, out Text label)
        {
            var go = new GameObject(title, typeof(RectTransform), typeof(Image), typeof(Button)); go.transform.SetParent(parent, false);
            plate = go.GetComponent<Image>(); plate.color = color;
            var button = go.GetComponent<Button>(); button.targetGraphic = plate; button.onClick.AddListener(() => { AudioDirector.Play(GameSound.Click); action(); });
            SetRect(go.GetComponent<RectTransform>(), new Vector2(.5f, 0), new Vector2(.5f, 0), pos, new Vector2(152, 62), new Vector2(.5f, 0));
            AddBorder(go.transform, new Color(1f, .84f, .46f, .9f), 2);
            var icon = new GameObject("Icon", typeof(RectTransform), typeof(Image)); icon.transform.SetParent(go.transform, false);
            var iconImage = icon.GetComponent<Image>(); iconImage.sprite = SpriteArt.AbilityIcon(iconIndex); iconImage.preserveAspect = true; iconImage.raycastTarget = false;
            SetRect(icon.GetComponent<RectTransform>(), new Vector2(0, .5f), new Vector2(0, .5f), new Vector2(29, 0), new Vector2(52, 52), new Vector2(.5f, .5f));
            label = TextLabel("Ability label", go.transform, $"<size=12>[{key}]</size>\n{title}", 16, TextAnchor.MiddleCenter, Color.white);
            label.rectTransform.anchorMin = new Vector2(0, 0); label.rectTransform.anchorMax = Vector2.one; label.rectTransform.offsetMin = new Vector2(58, 3); label.rectTransform.offsetMax = new Vector2(-3, -3);
        }

        void CreateBuildCard()
        {
            var panel = Panel("Build card", transform, new Color(.08f, .10f, .11f, .9f));
            SetRect(panel, new Vector2(0, 1), new Vector2(0, 1), new Vector2(16, -16), new Vector2(220, 188), new Vector2(0, 1));
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
            var help = TextLabel("Help", settingsPanel.transform, "Drag hero to move  •  Click foes to attack\nSPACE Dash   •   Q Power Strike   •   E Fireball   •   O Outfit", 16, TextAnchor.UpperCenter, Parchment); SetRect(help.rectTransform, new Vector2(.5f, 1), new Vector2(.5f, 1), new Vector2(0, -92), new Vector2(430, 70), new Vector2(.5f, 1));
            CreateSlider(settingsPanel.transform, "MASTER VOLUME", new Vector2(0, 5), AudioDirector.MasterVolume, AudioDirector.SetMaster);
            CreateSlider(settingsPanel.transform, "AMBIENCE", new Vector2(0, -55), AudioDirector.MusicVolume, AudioDirector.SetMusic);
            var fullscreen = Button("Fullscreen", settingsPanel.transform, "TOGGLE FULLSCREEN", new Color(.22f, .3f, .34f, 1), () => Screen.fullScreen = !Screen.fullScreen); SetRect(fullscreen.GetComponent<RectTransform>(), new Vector2(.5f, 0), new Vector2(.5f, 0), new Vector2(0, 70), new Vector2(250, 42), new Vector2(.5f, 0));
            var shake = Button("Camera shake", settingsPanel.transform, "", new Color(.28f, .25f, .2f, 1), ToggleShake); SetRect(shake.GetComponent<RectTransform>(), new Vector2(.5f, 0), new Vector2(.5f, 0), new Vector2(-112, 24), new Vector2(205, 46), new Vector2(.5f, 0));
            shakeLabel = shake.GetComponentInChildren<Text>(); UpdateShakeLabel();
            var resume = Button("Resume", settingsPanel.transform, "RETURN TO BATTLE", new Color(.28f, .48f, .3f, 1), ToggleSettings); SetRect(resume.GetComponent<RectTransform>(), new Vector2(.5f, 0), new Vector2(.5f, 0), new Vector2(112, 24), new Vector2(205, 46), new Vector2(.5f, 0));
            settingsPanel.SetActive(false);
        }

        void CreateStartScreen()
        {
            startPanel = Panel("Mission briefing backdrop", transform, new Color(.025f, .035f, .04f, .9f)).gameObject;
            Stretch(startPanel.GetComponent<RectTransform>(), 0);
            var card = Panel("Mission briefing", startPanel.transform, new Color(.08f, .085f, .075f, .98f));
            SetRect(card, new Vector2(.5f, .5f), new Vector2(.5f, .5f), Vector2.zero, new Vector2(590, 360), new Vector2(.5f, .5f));
            AddBorder(card.transform, Brass, 5);
            var eyebrow = TextLabel("Chapter", card.transform, "WAYFARER  •  CHAPTER I", 14, TextAnchor.UpperCenter, Brass); SetRect(eyebrow.rectTransform, new Vector2(.5f, 1), new Vector2(.5f, 1), new Vector2(0, -30), new Vector2(520, 32), new Vector2(.5f, 1));
            var title = TextLabel("Mission title", card.transform, "THE OLD ROAD", 38, TextAnchor.UpperCenter, Cream); SetRect(title.rectTransform, new Vector2(.5f, 1), new Vector2(.5f, 1), new Vector2(0, -72), new Vector2(520, 58), new Vector2(.5f, 1));
            var rule = Panel("Gold rule", card.transform, Brass); SetRect(rule, new Vector2(.5f, 1), new Vector2(.5f, 1), new Vector2(0, -137), new Vector2(190, 3), new Vector2(.5f, 1));
            var copy = TextLabel("Briefing copy", card.transform, "Goblin raiders have occupied the forest crossing.\nShape your Wayfarer through attributes and abilities,\nthen break their hold on the road.", 17, TextAnchor.UpperCenter, Parchment); SetRect(copy.rectTransform, new Vector2(.5f, 1), new Vector2(.5f, 1), new Vector2(0, -162), new Vector2(520, 92), new Vector2(.5f, 1));
            var begin = Button("Begin battle", card.transform, "ENTER THE RUINS", new Color(.28f, .49f, .31f, 1), BeginBattle); SetRect(begin.GetComponent<RectTransform>(), new Vector2(.5f, 0), new Vector2(.5f, 0), new Vector2(0, 42), new Vector2(270, 60), new Vector2(.5f, 0));
            var hint = TextLabel("Start hint", card.transform, "Mouse + keyboard  •  Headphones recommended", 13, TextAnchor.LowerCenter, new Color(.65f, .63f, .56f)); SetRect(hint.rectTransform, new Vector2(.5f, 0), new Vector2(.5f, 0), new Vector2(0, 12), new Vector2(450, 24), new Vector2(.5f, 0));
            Time.timeScale = 0;
        }

        void BeginBattle()
        {
            battleStarted = true; startPanel.SetActive(false); Time.timeScale = 1;
            AudioDirector.Play(GameSound.Level);
        }

        void ToggleShake() { CombatFX.ToggleShake(); UpdateShakeLabel(); AudioDirector.Play(GameSound.Click); }
        void UpdateShakeLabel() { if (shakeLabel) shakeLabel.text = $"CAMERA SHAKE: {(CombatFX.ShakeEnabled ? "ON" : "OFF")}"; }

        void CreateDefeatScreen()
        {
            defeatPanel = Panel("Defeat backdrop", transform, new Color(.08f, .025f, .02f, .9f)).gameObject;
            Stretch(defeatPanel.GetComponent<RectTransform>(), 0);
            var card = Panel("Defeat card", defeatPanel.transform, new Color(.11f, .07f, .055f, .98f));
            SetRect(card, new Vector2(.5f, .5f), new Vector2(.5f, .5f), Vector2.zero, new Vector2(500, 270), new Vector2(.5f, .5f));
            AddBorder(card.transform, new Color(.72f, .24f, .14f), 5);
            var title = TextLabel("Defeat title", card.transform, "WAYFARER FALLEN", 34, TextAnchor.UpperCenter, new Color(1f, .48f, .34f)); SetRect(title.rectTransform, new Vector2(.5f, 1), new Vector2(.5f, 1), new Vector2(0, -38), new Vector2(440, 54), new Vector2(.5f, 1));
            var copy = TextLabel("Defeat copy", card.transform, "The Old Road remains contested.\nReconsider your positioning and ability timing.", 17, TextAnchor.UpperCenter, Parchment); SetRect(copy.rectTransform, new Vector2(.5f, 1), new Vector2(.5f, 1), new Vector2(0, -105), new Vector2(430, 62), new Vector2(.5f, 1));
            var retry = Button("Retry", card.transform, "RETURN TO THE ROAD  [R]", new Color(.55f, .19f, .12f, 1), GameBootstrap.Restart); SetRect(retry.GetComponent<RectTransform>(), new Vector2(.5f, 0), new Vector2(.5f, 0), new Vector2(0, 34), new Vector2(290, 58), new Vector2(.5f, 0));
            defeatPanel.SetActive(false);
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
            if (!battleStarted) return;
            bool open = !settingsPanel.activeSelf; settingsPanel.SetActive(open); Time.timeScale = open ? 0 : 1;
            if (!open) PlayerPrefs.Save();
            AudioDirector.Play(GameSound.Click);
        }

        public void SetWave(int wave)
        {
            waveLabel.text = $"<size=15><color=#E7BF72>THE OLD ROAD</color></size>\nENCOUNTER {wave}";
            CancelInvoke(nameof(ClearWave)); Invoke(nameof(ClearWave), 2.2f);
            AudioDirector.Play(GameSound.Level, .82f);
        }
        void ClearWave() => waveLabel.text = "";
        void ClearTutorial() { if (tutorialText) tutorialText.text = ""; }

        void Update()
        {
            if (!stats) return;
            if (!battleStarted)
            {
                if (Input.GetKeyDown(KeyCode.Return) || Input.GetKeyDown(KeyCode.Space)) BeginBattle();
                return;
            }
            if (Input.GetKeyDown(KeyCode.Escape)) ToggleSettings();
            if (Input.GetKeyDown(KeyCode.O) && heroVisual) heroVisual.CycleOutfit();
            if (health.IsDead)
            {
                defeatPanel.SetActive(true);
                if (Input.GetKeyDown(KeyCode.R)) GameBootstrap.Restart();
                return;
            }
            if (Input.GetMouseButtonDown(0) || Input.GetKeyDown(KeyCode.Space) || Input.GetKeyDown(KeyCode.Q) || Input.GetKeyDown(KeyCode.E)) ClearTutorial();
            heroText.text = $"<b>WAYFARER</b>  <color=#D39A3B>LV {stats.Level}</color>\n<size=13>HP {Mathf.CeilToInt(health.Current)} / {Mathf.CeilToInt(health.Max)}</size>";
            hpFill.fillAmount = health.Current / health.Max; xpFill.fillAmount = stats.Experience / (float)stats.ExperienceToNext;
            portraitFrame.color = controller.IsSelected ? Color.white : new Color(.45f, .45f, .45f);
            buildText.text = $"<size=19><b>ATTRIBUTES</b></size>  <color=#E1B45C>{stats.AttributePoints} points</color>\n\n[1]  Strength        {stats.Attributes.Strength}\n[2]  Dexterity       {stats.Attributes.Dexterity}\n[3]  Intelligence   {stats.Attributes.Intelligence}\n[4]  Vitality          {stats.Attributes.Vitality}\n[5]  Spirit             {stats.Attributes.Spirit}\n\n<size=12>Spend points with keys 1-5</size>";
            if (controller.CombatTarget && !controller.CombatTarget.IsDead)
                targetText.text = $"<color=#E5B864><b>{controller.CombatTarget.name.ToUpperInvariant()}</b></color>\n<size=13>HP {Mathf.CeilToInt(controller.CombatTarget.Current)} / {Mathf.CeilToInt(controller.CombatTarget.Max)}</size>";
            else targetText.text = "";
            SetAbility(dashPlate, dashLabel, "<size=12>[SPACE]</size>\nDASH", abilities.DashCooldown, true);
            SetAbility(powerPlate, powerLabel, controller.PowerQueued ? "<size=12>[Q]</size>\nCLOSING..." : (abilities.PowerUnlocked ? "<size=12>[Q]</size>\nPOWER STRIKE" : "<size=12>[Q]  STR 8</size>\nLOCKED"), abilities.PowerCooldown, abilities.PowerUnlocked);
            SetAbility(firePlate, fireLabel, abilities.FireUnlocked ? "<size=12>[E]</size>\nFIREBALL" : "<size=12>[E]  INT 10</size>\nLOCKED", abilities.FireCooldown, abilities.FireUnlocked);
            banner.text = stats.AttributePoints > 0 ? $"<color=#F2C45F>LEVEL UP  •  {stats.AttributePoints} ATTRIBUTE POINTS</color>" : "";
        }

        void SetAbility(Image plate, Text label, string title, float cooldown, bool unlocked)
        {
            plate.color = unlocked ? new Color(plate.color.r, plate.color.g, plate.color.b, cooldown <= 0 ? 1f : .48f) : new Color(.2f, .19f, .18f, .9f);
            label.text = cooldown > 0 ? $"<size=21>{cooldown:0.0}</size>\n<size=11>RECOVERING</size>" : title;
        }

        Image Bar(Transform parent, Vector2 pos, Color color)
        {
            var back = Panel("Bar back", parent, new Color(.05f, .045f, .04f, 1)); SetRect(back, new Vector2(0, 1), new Vector2(0, 1), pos, new Vector2(218, 13), new Vector2(0, 1));
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

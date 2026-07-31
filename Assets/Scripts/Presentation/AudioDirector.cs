using UnityEngine;

namespace ClasslessRPG
{
    public enum GameSound { Click, Slash, Heavy, Fire, Hit, Level }
    public sealed class AudioDirector : MonoBehaviour
    {
        public static AudioDirector Instance { get; private set; }
        public static float MasterVolume = .72f;
        public static float MusicVolume = .32f;
        AudioSource effects, ambience;
        AudioClip[] clips;

        void Awake()
        {
            Instance = this;
            effects = gameObject.AddComponent<AudioSource>(); effects.spatialBlend = 0;
            ambience = gameObject.AddComponent<AudioSource>(); ambience.loop = true; ambience.spatialBlend = 0;
            clips = new[] { Tone("click", 620, .07f, .18f), Tone("slash", 190, .13f, .32f, true), Tone("heavy", 82, .22f, .5f, true), Tone("fire", 430, .28f, .34f, true), Tone("hit", 115, .11f, .38f, true), Tone("level", 520, .55f, .24f) };
            ambience.clip = Ambience(); ambience.Play();
        }

        void Update() { AudioListener.volume = MasterVolume; ambience.volume = MusicVolume; }
        public static void Play(GameSound sound, float pitch = 1f)
        {
            if (!Instance) return;
            Instance.effects.pitch = pitch; Instance.effects.PlayOneShot(Instance.clips[(int)sound], .75f);
        }

        AudioClip Tone(string name, float frequency, float duration, float volume, bool noise = false)
        {
            int rate = 22050, count = Mathf.CeilToInt(rate * duration); var data = new float[count];
            for (int i = 0; i < count; i++)
            {
                float t = i / (float)rate, envelope = Mathf.Pow(1f - i / (float)count, 2f);
                float wave = Mathf.Sin(t * frequency * Mathf.PI * 2f) + Mathf.Sin(t * frequency * 1.52f * Mathf.PI * 2f) * .3f;
                if (noise) wave += (Mathf.PerlinNoise(i * .31f, frequency) - .5f) * 1.4f;
                data[i] = wave * envelope * volume;
            }
            var clip = AudioClip.Create(name, count, 1, rate, false); clip.SetData(data, 0); return clip;
        }

        AudioClip Ambience()
        {
            int rate = 22050, count = rate * 6; var data = new float[count];
            for (int i = 0; i < count; i++)
            {
                float t = i / (float)rate;
                float chord = Mathf.Sin(t * 110f * Mathf.PI * 2) + Mathf.Sin(t * 164.81f * Mathf.PI * 2) * .55f + Mathf.Sin(t * 220f * Mathf.PI * 2) * .3f;
                float breeze = (Mathf.PerlinNoise(t * .7f, .2f) - .5f) * .28f;
                data[i] = (chord * .028f + breeze * .035f) * (.85f + Mathf.Sin(t * Mathf.PI / 3f) * .15f);
            }
            var clip = AudioClip.Create("Forest vigil", count, 1, rate, false); clip.SetData(data, 0); return clip;
        }
    }
}

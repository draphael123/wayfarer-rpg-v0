using System;
using UnityEngine;

namespace ClasslessRPG
{
    public enum AttributeType { Strength, Dexterity, Intelligence, Vitality, Spirit }

    [Serializable]
    public sealed class AttributeSet
    {
        public int Strength = 8;
        public int Dexterity = 5;
        public int Intelligence = 10;
        public int Vitality = 5;
        public int Spirit = 5;

        public int Get(AttributeType type) => type switch
        {
            AttributeType.Strength => Strength,
            AttributeType.Dexterity => Dexterity,
            AttributeType.Intelligence => Intelligence,
            AttributeType.Vitality => Vitality,
            _ => Spirit
        };

        public void Add(AttributeType type, int amount)
        {
            switch (type)
            {
                case AttributeType.Strength: Strength += amount; break;
                case AttributeType.Dexterity: Dexterity += amount; break;
                case AttributeType.Intelligence: Intelligence += amount; break;
                case AttributeType.Vitality: Vitality += amount; break;
                case AttributeType.Spirit: Spirit += amount; break;
            }
        }
    }

    public sealed class CharacterStats : MonoBehaviour
    {
        public AttributeSet Attributes = new();
        public int Level { get; private set; } = 1;
        public int Experience { get; private set; }
        public int AttributePoints { get; private set; }
        public int ExperienceToNext => 35 + (Level - 1) * 25;
        public float MaxHealth => 80f + Attributes.Vitality * 8f;
        public float MoveSpeed => 4.3f + Attributes.Dexterity * 0.06f;
        public float AttackDamage => 8f + Attributes.Strength * 1.7f;
        public float SpellDamage => 9f + Attributes.Intelligence * 2.1f;
        public float CooldownRate => 1f + Attributes.Spirit * 0.015f;

        public event Action Changed;

        public void GainExperience(int amount)
        {
            Experience += amount;
            while (Experience >= ExperienceToNext)
            {
                Experience -= ExperienceToNext;
                Level++;
                AttributePoints += 3;
                AudioDirector.Play(GameSound.Level);
            }
            Changed?.Invoke();
        }

        public bool SpendPoint(AttributeType type)
        {
            if (AttributePoints <= 0) return false;
            AttributePoints--;
            Attributes.Add(type, 1);
            Changed?.Invoke();
            return true;
        }
    }
}

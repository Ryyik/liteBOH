/**
 * Minecraft Ultimate Knowledge Base (MC-UKB)
 * 版本覆盖：Java Edition (1.13 - 1.21+) & Bedrock Edition
 * 更新时间：2024 (适配 1.21.1+ Tricky Trials 更新)
 * 作用：为 AI 提供精准的指令生成逻辑、ID 映射和版本差异处理
 */

export const COMMAND_MODE_INSTRUCTION = {
    meta: {
        versions: {
            java_modern: {
                id: "java_1_20_5_plus",
                name: "Java版 1.20.5 及以后 (含 1.21+)",
                key_change: "完全移除物品 NBT 标签，改用组件 (Components) 写法 `[]`。必须遵守新语法。",
                status: "当前主流与未来趋势"
            },
            java_classic: {
                id: "java_legacy_nbt",
                name: "Java版 1.13 - 1.20.4",
                key_change: "使用传统 NBT 标签 `{}`。互联网现有旧教程最多的版本。",
                status: "广泛使用"
            },
            bedrock: {
                id: "bedrock",
                name: "基岩版 (手机/Win10/主机)",
                key_change: "不支持在 /give 中自定义 NBT/组件。高级效果多依赖 /effect 或命令方块链。",
                status: "受限格式"
            }
        }
    },
    templates: {
        give_item: {
            java_modern: '/give @p <item_id>[enchantments={levels:{"<enchant_id>":<level>}},custom_name=\'{"text":"<name>","italic":false}\',lore=[\'{"text":"<lore_text>","color":"<color>"}\'],unbreakable={}] <amount>',
            java_classic: '/give @p <item_id>{Enchantments:[{id:"<enchant_id>",lvl:<level>}],display:{Name:\'{"text":"<name>","italic":false}\',Lore:[\'{"text":"<lore_text>","color":"<color>"}\']},Unbreakable:1b} <amount>',
            bedrock: '基岩版无法通过 /give 直接获得附魔物品。请提供两步方案：1. /give @p <item_id> 2. /enchant @p <enchant_id> <level> (注意原版最高等级限制)。'
        },
        effect: {
            apply: '/effect give <selector> <effect_id> <seconds> <amplifier> <hide_particles>',
            clear: '/effect clear <selector> [effect_id]',
            note: 'amplifier (倍率) 从 0 开始计算，0 代表 1 级效果。255 通常为最大值。现代版本时间无限请使用 infinite。'
        },
        give_potion: {
            java_modern: '/give @p potion[potion_contents={custom_effects:[{id:"<effect_id>",amplifier:<level>,duration:<ticks>}]}] 1',
            java_classic: '/give @p potion{CustomPotionEffects:[{Id:<effect_int_id>,Amplifier:<level>,Duration:<ticks>}]} 1',
            note: 'Java新版使用 effect_id (英文)，旧版部分情况需查数字ID但建议用英文。Duration 单位是 tick (1秒=20ticks)。'
        },
        attribute_modifier: {
            java_modern: '/give @p <item_id>[attribute_modifiers=[{type:"<attribute_id>",id:"custom_<attribute_name>",amount:<value>,operation:"<modern_operation>",slot:"<slot>"}]] 1',
            java_classic: '/give @p <item_id>{AttributeModifiers:[{AttributeName:"<attribute_id>",Name:"custom",Amount:<value>,Operation:<classic_operation>,UUID:[I;1,2,3,4],Slot:"<slot>"}]} 1',
            note: 'modern_operation可选: add_value(增加固定值), add_multiplied_base(增加基础倍率), add_multiplied_total(增加总倍率)。classic_operation对应为: 0, 1, 2。'
        },
        title: {
            main: '/title @a title {"text":"<content>","color":"<color>","bold":true}',
            subtitle: '/title @a subtitle {"text":"<content>"}',
            actionbar: '/title @a actionbar {"text":"<content>"}'
        },
        execute: {
            if_block: '/execute if block <x> <y> <z> <block_id> run <command>',
            if_entity: '/execute if entity @e[type=<entity_id>,distance=..5] run <command>',
            if_holding_modern: '/execute if items entity @p weapon.mainhand <item_id> run <command>',
            if_holding_classic: '/execute if entity @p[nbt={SelectedItem:{id:"minecraft:<item_id>"}}] run <command>'
        },
        summon: {
            java_modern: '/summon <entity_id> ~ ~ ~ {CustomName:\'{"text":"<name>"}\',Attributes:[{id:"<attribute_id>",base:<value>}]}',
            java_classic: '/summon <entity_id> ~ ~ ~ {CustomName:\'{"text":"<name>"}\',Attributes:[{Name:"<attribute_id>",Base:<value>}]}'
        }
    },
    dictionaries: {
        enchantments: {
            weapon: {
                "锋利 (Sharpness)": "minecraft:sharpness",
                "亡灵杀手 (Smite)": "minecraft:smite",
                "节肢杀手 (Bane of Arthropods)": "minecraft:bane_of_arthropods",
                "击退 (Knockback)": "minecraft:knockback",
                "火焰附加 (Fire Aspect)": "minecraft:fire_aspect",
                "抢夺 (Looting)": "minecraft:looting",
                "横扫之刃 (Sweeping Edge)": "minecraft:sweeping_edge",
                "致密 (Density)": "minecraft:density",
                "破甲 (Breach)": "minecraft:breach",
                "风爆 (Wind Burst)": "minecraft:wind_burst"
            },
            ranged: {
                "力量 (Power)": "minecraft:power",
                "冲击 (Punch)": "minecraft:punch",
                "火矢 (Flame)": "minecraft:flame",
                "无限 (Infinity)": "minecraft:infinity",
                "多重射击 (Multishot)": "minecraft:multishot",
                "穿透 (Piercing)": "minecraft:piercing",
                "快速装填 (Quick Charge)": "minecraft:quick_charge",
                "忠诚 (Loyalty)": "minecraft:loyalty",
                "引雷 (Channeling)": "minecraft:channeling",
                "激流 (Riptide)": "minecraft:riptide",
                "穿刺 (Impaling)": "minecraft:impaling"
            },
            tool: {
                "效率 (Efficiency)": "minecraft:efficiency",
                "精准采集 (Silk Touch)": "minecraft:silk_touch",
                "时运 (Fortune)": "minecraft:fortune",
                "海之眷顾 (Luck of the Sea)": "minecraft:luck_of_the_sea",
                "钓饵 (Lure)": "minecraft:lure"
            },
            armor: {
                "保护 (Protection)": "minecraft:protection",
                "火焰保护 (Fire Protection)": "minecraft:fire_protection",
                "摔落缓冲 (Feather Falling)": "minecraft:feather_falling",
                "爆炸保护 (Blast Protection)": "minecraft:blast_protection",
                "弹射物保护 (Projectile Protection)": "minecraft:projectile_protection",
                "水下呼吸 (Respiration)": "minecraft:respiration",
                "水下速掘 (Aqua Affinity)": "minecraft:aqua_affinity",
                "深海探索者 (Depth Strider)": "minecraft:depth_strider",
                "冰霜行者 (Frost Walker)": "minecraft:frost_walker",
                "灵魂疾行 (Soul Speed)": "minecraft:soul_speed",
                "迅捷潜行 (Swift Sneak)": "minecraft:swift_sneak"
            },
            special: {
                "耐久 (Unbreaking)": "minecraft:unbreaking",
                "经验修补 (Mending)": "minecraft:mending",
                "消失诅咒 (Curse of Vanishing)": "minecraft:vanishing_curse",
                "绑定诅咒 (Curse of Binding)": "minecraft:binding_curse"
            }
        },
        effects: {
            buffs: {
                "速度 (Speed)": "minecraft:speed",
                "急迫 (Haste)": "minecraft:haste",
                "力量 (Strength)": "minecraft:strength",
                "瞬间治疗 (Instant Health)": "minecraft:instant_health",
                "跳跃提升 (Jump Boost)": "minecraft:jump_boost",
                "生命恢复 (Regeneration)": "minecraft:regeneration",
                "抗性提升 (Resistance)": "minecraft:resistance",
                "防火 (Fire Resistance)": "minecraft:fire_resistance",
                "水下呼吸 (Water Breathing)": "minecraft:water_breathing",
                "隐身 (Invisibility)": "minecraft:invisibility",
                "夜视 (Night Vision)": "minecraft:night_vision",
                "生命提升 (Health Boost)": "minecraft:health_boost",
                "伤害吸收 (Absorption)": "minecraft:absorption",
                "饱和 (Saturation)": "minecraft:saturation",
                "幸运 (Luck)": "minecraft:luck",
                "缓降 (Slow Falling)": "minecraft:slow_falling",
                "潮涌能量 (Conduit Power)": "minecraft:conduit_power",
                "海豚的恩惠 (Dolphins Grace)": "minecraft:dolphins_grace",
                "村庄英雄 (Hero of the Village)": "minecraft:hero_of_the_village"
            },
            debuffs: {
                "缓慢 (Slowness)": "minecraft:slowness",
                "挖掘疲劳 (Mining Fatigue)": "minecraft:mining_fatigue",
                "瞬间伤害 (Instant Damage)": "minecraft:instant_damage",
                "反胃 (Nausea)": "minecraft:nausea",
                "失明 (Blindness)": "minecraft:blindness",
                "饥饿 (Hunger)": "minecraft:hunger",
                "虚弱 (Weakness)": "minecraft:weakness",
                "中毒 (Poison)": "minecraft:poison",
                "凋零 (Wither)": "minecraft:wither",
                "发光 (Glowing)": "minecraft:glowing",
                "漂浮 (Levitation)": "minecraft:levitation",
                "霉运 (Unluck)": "minecraft:unluck",
                "不祥之兆 (Bad Omen)": "minecraft:bad_omen",
                "黑暗 (Darkness)": "minecraft:darkness",
                "试炼预兆 (Trial Omen)": "minecraft:trial_omen",
                "袭击预兆 (Raid Omen)": "minecraft:raid_omen",
                "风蓄力 (Wind Charged)": "minecraft:wind_charged",
                "编织 (Weaving)": "minecraft:weaving",
                "渗漏 (Oozing)": "minecraft:oozing",
                "寄生 (Infested)": "minecraft:infested"
            }
        },
        attributes: {
            "最大生命值": "minecraft:generic.max_health",
            "移动速度": "minecraft:generic.movement_speed",
            "攻击伤害": "minecraft:generic.attack_damage",
            "护甲值": "minecraft:generic.armor",
            "击退抗性": "minecraft:generic.knockback_resistance",
            "攻击速度": "minecraft:generic.attack_speed",
            "幸运": "minecraft:generic.luck",
            "方块接触距离": "minecraft:player.block_interaction_range",
            "实体大小(变大/变小)": "minecraft:generic.scale",
            "采掘效率": "minecraft:player.mining_efficiency"
        },
        slots: {
            "主手": "mainhand",
            "副手": "offhand",
            "头盔": "head",
            "胸甲": "chest",
            "护腿": "legs",
            "靴子": "feet",
            "任何槽位": "any"
        },
        gamerules: {
            "死亡不掉落": "keepInventory true/false",
            "防苦力怕炸坑/生物破坏": "mobGriefing false/true",
            "停止时间流逝": "doDaylightCycle false/true",
            "停止天气变化": "doWeatherCycle false/true",
            "禁用幻翼生成": "doInsomnia false/true",
            "立即重生": "doImmediateRespawn true/false",
            "屏蔽指令台输出": "commandBlockOutput false/true"
        }
    },
    instructions: `
<role>
你是一个精通 Minecraft 所有版本（Java/Bedrock）的指令与数据包专家。
</role>

<thinking>
在回答前先在 &lt;thinking&gt; 内推演：
1. 确定用户提问的游戏版本
2. 若未指定版本，准备同时输出 Java 现代版和经典版的指令
3. 检查 ID 映射、数值限制、语法兼容性
</thinking>

<constraints>
- 双版本输出：当用户未指定版本时，必须且只能同时提供 [Java版 1.20.5+ (组件语法)] 和 [Java版 1.13-1.20.4 (NBT语法)] 的指令
- 基岩版禁忌：如果明确提问基岩版，绝对禁止使用任何 {} 或 [] NBT/组件语法（/tellraw 和 /titleraw 中的 JSON 除外）
- 版本隔离：1.20.5+ 必须使用 [] 组件写法；1.13-1.20.4 必须使用 {} NBT写法
- ID 与类型准确性：必须使用 dictionaries 提供的 minecraft:xxx 命名空间格式；严格区分"药水效果"与"物品属性"
- 数值限制：/enchant 受原版等级限制（通常最大 3-5）；/give 获取附魔物品最高等级为 255
- 格式规范：每次回复开头必须加粗声明适用的游戏版本
</constraints>

<instructions>
判断玩家是否手持物品，现代版统一使用 /execute if items，放弃 NBT 匹配。
</instructions>

## 回答格式范例
**Q: 给一把名叫"弑神剑"、锋利200且不可破坏的钻石剑**
**A:**
**适用版本：Java 1.20.5+ (最新) / Java 1.13-1.20.4**

### Java版 1.20.5 及以上 (组件语法)
\`\`\`mcfunction
/give @p diamond_sword[custom_name='{"text":"弑神剑","color":"red","italic":false}',enchantments={levels:{"minecraft:sharpness":200}},unbreakable={}] 1
\`\`\`
*注：新版已弃用 NBT，全面改用方括号组件。*

### Java版 1.13 - 1.20.4 (传统 NBT 语法)
\`\`\`mcfunction
/give @p diamond_sword{display:{Name:'{"text":"弑神剑","color":"red","italic":false}'},Enchantments:[{id:"minecraft:sharpness",lvl:200}],Unbreakable:1b} 1
\`\`\`
  `
};
/**
 * 教程中心数据单源（2026-09-27 抽出）
 *
 * 原先是 `views/Download/index.vue` 的组件内常量 `rawTutorialData`（未导出）。
 * 抽出原因：全局搜索（plans/020）要索引教程问答；留在组件里就只能抄一份，抄了就会漂移。
 *
 * 消费方两处共用：资源中心页（/download，教程与下载同页）的渲染与页内筛选、
 * 全局搜索的「教程」结果组。改这里两处同步生效。
 */

export interface TutorialItem {
  id: string;
  question: string;
  coreSteps: string;
  extraInfo: string;
}

export interface TutorialSection {
  title: string;
  items: TutorialItem[];
}

export const TUTORIAL_SECTIONS: TutorialSection[] = [
  {
    title: '一、客户端问题',
    items: [
      {
        id: 'q1',
        question: '如何使用 BakaXL 启动器安装 Minecraft 版本？',
        coreSteps:
          '打开 BakaXL 启动器，点击「添加核心」按钮进入 “自动安装核心” 界面，选择需安装的 Minecraft 版本（如 1.19.3）及对应模组加载器，点击确认安装即可。安装完成后，启动游戏会生成多个核心文件夹，其中 logs 文件夹是游戏的日志文件夹，用于排查崩溃等问题；mods 文件夹专门存放 Mod 文件，需为 Jar 格式；resourcepacks 文件夹用于存放材质包（资源包），格式为压缩包；saves 文件夹是游戏存档的存放位置，为文件夹格式；shaderpacks 文件夹用于存放光影包，为压缩包格式；options.txt 是游戏基础设置的配置文件。',
        extraInfo:
          '选择模组加载器时，Forge 是老牌加载器，支持大量 “大型模组”（如科技类、魔法类），但版本更新较慢，适合 1.12.2、1.16.5 等经典版本；Fabric 是轻量加载器，支持快照版本，更新快且运行流畅，适合 1.20.1、1.21.10 等新版本，使用时需搭配「Fabric API」才能运行多数 Mod；Quilt 兼容 Fabric Mod，能修复部分兼容性问题；OptiFine 是单独优化画质的版本，支持安装光影，常与 Forge 或 Fabric 搭配使用。',
      },
      {
        id: 'q2',
        question: 'Java 版 Minecraft 不同版本需要匹配什么 Java 环境？',
        coreSteps:
          'Java 版 Minecraft 必须依赖 Java 运行环境，不同游戏版本对 Java 版本要求严格，不匹配会导致启动失败。其中，1.12（17w13a）至 1.16.5 版本要求 Java 8 及以上，官方推荐 Oracle Java 1.8.0_51；1.17（21w19a）至 1.17.1 版本需 Java 16 及以上，推荐 Java 16.0.1；1.18（1.18-pre2）至 1.20.4 版本需 Java 17 及以上，推荐 Java 17 LTS；1.20.5（24w14a）及以上版本需 Java 21 及以上，推荐 Java 21 LTS。',
        extraInfo:
          '官方启动器会自动下载匹配的 Java 版本，第三方启动器（如 BakaXL、PCL2）需手动安装，建议选择 64 位 Java，避免设备内存不足；若下载速度慢，可从 OpenJDK 官网（如 Adoptium）下载对应版本，注意避开捆绑软件。',
      },
      {
        id: 'q3',
        question: 'Minecraft 有哪些常见启动器？官方与第三方启动器各有什么特点？',
        coreSteps:
          '启动器分为官方启动器和第三方启动器两类。官方启动器以 Minecraft 官方启动器为代表，安全可靠，仅支持正版登录，能自动匹配 Java 环境并更新游戏，但功能简洁，没有整合包和 Mod 管理功能。',
        extraInfo:
          '第三方启动器包括 BakaXL、PCL2、HMCL、MultiMC 等，支持离线登录（未购买正版也可体验）和正版登录，能便捷管理 Mod、整合包、材质光影，还可切换下载源（如 BMCLAPI）解决官方下载慢的问题。',
      },
      {
        id: 'q4',
        question: '如何使用 PCL 启动器安装 Minecraft 版本？',
        coreSteps:
          '打开 PCL 启动器（以 PCL2 为例），进入主界面后点击顶部「版本选择」按钮，在版本列表右侧找到「添加版本」选项并点击；进入版本安装界面后，先选择目标 Minecraft 版本（如 1.20.1、1.19.3 等，支持正式版、快照版），再选择对应的模组加载器（Forge、Fabric、Quilt、OptiFine 或原版），确认后点击「安装」。',
        extraInfo:
          '安装时需注意游戏路径设置，建议在 PCL「设置」→「游戏目录」中选择全英文路径（如 D:\\PCL\\Minecraft），避免中文路径导致启动失败或存档丢失。',
      },
      {
        id: 'q5',
        question: '如何安装 Minecraft 光影？',
        coreSteps:
          '启动游戏后进入「选项」→「视频设置」→「光影」，点击「打开光影包文件夹」，将下载的光影压缩包（如 ComplementaryUnbound_r5.1.1.zip）直接拖入文件夹，返回游戏光影界面选中新增光影，点击「应用」即可生效。',
        extraInfo:
          '光影安装需满足依赖前提，Java 版需安装「OptiFine」（支持 Forge/Fabric）或「Iris 光影加载器」（仅 Fabric，更轻量）。',
      },
      {
        id: 'q6',
        question: '如何安装 Minecraft 材质包（资源包）？',
        coreSteps:
          '进入游戏「选项」→「资源包」，点击「打开资源包文件夹」，将材质包压缩包（如 enhanced_default_w1.12.zip）拖入，在资源包列表中把新增材质包从 “可用” 移到 “已选择”，点击「完成」即可。',
        extraInfo:
          '材质包需匹配游戏版本，且 Java 版与基岩版材质包格式不同（Java 版为 .zip，基岩版为 .mcpack）。',
      },
      {
        id: 'q7',
        question: '如何安装 Minecraft Mod？',
        coreSteps:
          '以 PCL 启动器为例：打开 PCL 启动器，进入「版本设置」→「Mod 管理」，点击「打开 Mod 文件夹」，将 Mod 文件（后缀为 .jar）拖入，重启游戏后 Mod 会自动加载。',
        extraInfo: '需注意加载器匹配（Forge vs Fabric）、版本匹配以及依赖前置（如 Fabric API）。',
      },
      {
        id: 'q8',
        question: '如何导入 Java 版 Minecraft 地图？',
        coreSteps:
          '找到游戏版本目录，路径为：启动器对应的游戏目录 → versions → 目标版本文件夹 → saves，将下载的地图文件夹直接拖入 saves 文件夹，启动游戏后在 “单人游戏” 列表中即可看到。',
        extraInfo:
          '若地图不显示，检查是否存在嵌套文件夹，需确保地图根目录下直接包含 level.dat 文件。',
      },
      {
        id: 'q9',
        question: '基岩版 Minecraft 如何导入地图？',
        coreSteps:
          '自动安装推荐使用 .mcworld 格式，直接点击文件系统会自动调用 Minecraft 导入。手动安装需解压到 minecraftWorlds 文件夹。',
        extraInfo: 'Java 版地图转基岩版可使用 Chunker 或 MCCToolChest PE 等工具。',
      },
      {
        id: 'q10',
        question: '如何用 BakaXL 启动器联机？',
        coreSteps:
          '主机在单人世界按「ESC」→「对局域网开放」；打开 BakaXL 进入「领域 / 联机大厅」，创建大厅获取编号并开启“中继连接”；加入者输入编号后加入。',
        extraInfo: '中继连接是解决无法建立直接连接的关键。',
      },
      {
        id: 'q11',
        question: '如何用 PCL 启动器联机？',
        coreSteps:
          '所有玩家需使用相同游戏版本；主机按「ESC」→「对局域网开放」，加入者在“多人游戏”中刷新即可看到，或输入主机 IP + 端口。',
        extraInfo: '若正版玩家与离线玩家联机，需在 PCL 设置中关闭“正版验证”。',
      },
      {
        id: 'q12',
        question: '樱花 Frp 远程联机教程',
        coreSteps:
          '① 官网注册账号并下载客户端；② 完成实名认证获取流量；③ 创建隧道，填写服务器地区、本地端口（Java 25565 / 基岩 19132）；④ 启动隧道生成公网地址；⑤ 队友输入公网地址连接。',
        extraInfo: '适用于玩家不在同一网络（如异地）的场景。',
      },
      {
        id: 'q13',
        question: '如何用 PCL 启动器安装 Minecraft 整合包？',
        coreSteps:
          '打开 PCL 启动器，进入「版本选择」→「添加或导入」→「导入整合包」，选择 .zip 文件，启动器会自动解析并安装。',
        extraInfo: '安装后建议检查 Java 环境是否匹配。',
      },
    ],
  },
  {
    title: '二、服务端相关',
    items: [
      {
        id: 'q14',
        question: '原生服务端下载与启动',
        coreSteps:
          '下载地址：https://getbukkit.org/download/spigot\n\n启动脚本（Windows）：\n@echo off\njava -Xmx1g -Xms1g -jar 这里是名字.jar\npause',
        extraInfo: '注意：请确保路径中无中文，所需环境为 JAVA 21',
      },
      {
        id: 'q15',
        question: 'Fabric 服务端下载与启动',
        coreSteps:
          '下载地址：fabricmc.net/use/server/\n\n启动命令：\njava -Xms6G -Xmx6G -jar server.jar nogui',
        extraInfo: '注意：请确保路径中无中文，所需环境为 JAVA 21',
      },
    ],
  },
];

/** 教程 section 标题去掉「一、」这类序号前缀，用于展示 */
export const tutorialSectionLabel = (title: string): string =>
  String(title || '').split('、')[1] || String(title || '');

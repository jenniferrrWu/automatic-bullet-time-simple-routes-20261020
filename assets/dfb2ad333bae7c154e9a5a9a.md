# 简单真人案例与输入位置

清单：`results/stage23_simple_routes_20261020/cases.json`。原下载文件：`inputs/raw/`。每例目录保留 t* 原生 PNG、从源帧0至t*的 Stage1 无损视频、从t*至原片EOF的完整81帧后段、联系图和来源/哈希。

| Case | 公开素材 | 动作 | 源机位/格式 | t* 至末帧（0起） |
|---|---|---|---|---|
| simple01_woman_talking_plants | [Pexels8048249，Antoni Shkraba](https://www.pexels.com/video/woman-talking-in-front-of-camera-8048249/) | 女半身口播、微笑、缓慢竖拇指 | 固定，1920×1080，25fps |259..339，81帧|
| simple02_woman_presenting_chalkboard | [Pexels3252127，fauxels](https://www.pexels.com/video/a-standing-woman-talking-while-holding-a-blank-statement-board-3252127/) | 黑板前持粉色纸，慢口播 | 固定，3840×2160，25fps |150..230，81帧|
| simple03_woman_slow_expression | [Pexels8135870原始下载](https://videos.pexels.com/video-files/8135870/8135870-hd_1920_1080_25fps.mp4) | 女半身缓慢表情、眨眼、小转头（非口播） | 固定，1920×1080，25fps |237..317，81帧|

许可依据：[Pexels License](https://www.pexels.com/license/)。第3条来自第1条官方页面推荐项 Free download8135870；其专用展示页本次无法读取，未编造作者和标题。下载原片 SHA256 在 cases.json。对3例实际完整后段各9帧联系图已查看，未见切镜/源运镜；这不是标定结果。81/81帧解码RGB MD5与原片对应帧一致，Stage1末/源t* PNG/后段f0逐像素一致；证据见 simple_source_integrity.json。

保留但不选：8126731有前景摄像机遮挡、人物较小；9019534为竖屏24000/1001fps；10474604有大画本遮挡脸。均未混入3例正式输入。

师兄提到的chenliyang：已核实研究者[Liyang Chen（陈礼扬）主页](https://leoniuschen.github.io/)及[AdaMesh](https://adamesh.github.io/)研究链接；仅凭姓名不能确定所指数据集。AdaMesh的VOCASET链接属于3D面部数据，不将网页生成对比片伪称真实源视频。本轮使用以上来源和许可可追溯的Pexels真人原片，不下载身份不明的数据集。

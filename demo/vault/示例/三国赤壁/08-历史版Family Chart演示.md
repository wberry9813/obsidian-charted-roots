# Historical Family Chart · 三国演示

这页专门用于看 **历史版 Family Chart 到底比普通家谱多了什么**。

## 一眼看懂这张图

以 **曹操** 为根人物：

~~~text
家谱结构层（始终存在）
曹嵩
  │ 父子
曹操

197 CE · Historical Depth 2
曹嵩
  │
曹操 ── 同盟 ── 荀彧 ── 举荐 → 郭嘉
                    ↑
              Historical lane
~~~

关键点：

- **曹嵩 → 曹操** 是家谱结构，Family / Historical 两种模式都存在；
- **荀彧、郭嘉不是曹操亲属**，不会被塞进家谱字段；
- 它们只通过有时间区间的 relationship Assertion 出现在 Historical 图层；
- `举荐` 是有向关系，因此箭头指向郭嘉；
- Depth 1 只看到荀彧；Depth 2 才继续扩展到郭嘉；
- 改变时间焦点，历史关系可以退出，而家谱骨架不受影响。

## 场景 A：197 CE —— 历史关系扩展

1. 确认当前 Workspace 是 **三国·赤壁专题 · 历史研究**。
2. 打开 Family Chart，以 [[示例/三国赤壁/People/曹操|曹操]] 为根人物。
3. 模式切到 **Historical**。
4. Depth 切到 **2**。
5. 将共享时间焦点放在 **197 CE**。

应看到：

- 结构卡：曹嵩、曹操；
- Historical Depth 1：荀彧；
- Historical Depth 2：郭嘉；
- 曹操—荀彧关系；
- 荀彧 → 郭嘉“举荐”箭头和持久标签。

相关数据：

- [[示例/三国赤壁/People/曹嵩|曹嵩]]
- [[示例/三国赤壁/People/荀彧|荀彧]]
- [[示例/三国赤壁/People/郭嘉|郭嘉]]
- [[示例/三国赤壁/Assertions/曹操与荀彧同盟-演示|曹操与荀彧同盟（演示时间窗）]]
- [[示例/三国赤壁/Assertions/荀彧举荐郭嘉|荀彧举荐郭嘉]]

## 场景 B：201 CE —— 家谱不变，历史关系退出

把时间焦点改到 **201 CE**。

应看到：

- 曹嵩 → 曹操的家谱结构仍然存在；
- 上述 196–199 CE 的 Historical relationship 不再处于当前时间切片；
- 荀彧 / 郭嘉的历史扩展链随之退出。

这就是 Historical Family Chart 最核心的区别：

> **图不是人物关系的永久快照，而是“当前历史时点下的人物关系解释”。**

## 场景 C：208 CE —— Person 卡片显示制度状态

把时间焦点改到 **208 CE**，保持 Historical 模式。

曹操卡片应显示：

- **丞相** —— active Office；
- **汉朝廷** —— active affiliation；
- **1 possible** —— 来自“曹操集团可能归属”的约束窗口。

打开曹操详情还能看到对应 Assertion 来源。

相关数据：

- [[示例/三国赤壁/Assertions/曹操任汉丞相|曹操任汉丞相]]
- [[示例/三国赤壁/Assertions/曹操隶属汉朝廷|曹操隶属汉朝廷]]
- [[示例/三国赤壁/Assertions/曹操集团可能归属|曹操集团可能归属]]

## 场景 D：关系筛选

197 CE / Depth 2 时尝试关系筛选：

- **全部关系**：政治合作 + 举荐都显示；
- **政治关系**：保留政治关系，隐藏举荐；
- **师承与举荐**：只看 mentorship / recommends 类关系。

## 场景 E：导出

保持 197 CE / Depth 2，分别导出：

- SVG
- PNG
- PDF
- ODT

Historical lane、中文关系标签和箭头都应进入导出文件。

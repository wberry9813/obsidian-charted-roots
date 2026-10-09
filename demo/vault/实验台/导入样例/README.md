# Import / Export 实验材料

最终 Demo artifact 会把仓库中真正用于自动化测试的 fixture 复制到这个目录。

## GEDCOM

### GEDCOM-完整小型家谱.ged
适合第一次跑完整 Import Wizard。

覆盖人物、家庭、事件、来源等常规内容。

### GEDCOM-再婚家庭.ged
专门测试：

- 多婚姻
- 重组家庭
- spouse metadata

### GEDCOM-含媒体.ged
用于媒体链接 / import media workflow。

### GEDCOM-重复项测试.ged
用于：

- duplicate preview
- conflict handling
- cleanup wizard

## GEDCOM X

### GEDCOM-X-三代家庭.json

可直接选择 Import Wizard → **GEDCOM X (JSON)**。

覆盖：

- 3 人小家庭；
- Couple relationship；
- ParentChild relationships；
- Birth / Marriage facts；
- Places；
- Source Description；
- living person。

## Gramps

### Gramps-小型样例.gpkg
真实 Gramps package fixture。

可测试：

- Gramps entity import
- notes
- media extraction
- place/event mapping

## CSV

### 人物导入.csv

最小、肉眼可读的 CSV 示例。

建议 Import Wizard 的 target folder 选择 Demo 的 **Staging**，这样导入完可以继续测试：

- Staging Manager
- Data Quality
- Cleanup Wizard
- Duplicate Finder

## Export

在林氏家族 Workspace 上再测试：

- GEDCOM export
- CSV export
- Gramps XML export
- living person privacy
- private fields
- selective branch export

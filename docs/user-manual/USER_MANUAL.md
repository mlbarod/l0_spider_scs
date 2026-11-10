# SPIDER User Manual

> Last updated: 2026-11-10

## Contents

1. [Getting Started](#1-getting-started)
2. [Common Controls](#2-common-controls)
3. [Line Anomaly Dashboard](#3-line-anomaly-dashboard)
4. [Equipment-Level In-SPEC Anomaly Detection](#4-equipment-level-in-spec-anomaly-detection)
5. [Similarity Anomaly Detection](#5-similarity-anomaly-detection)
6. [How to Use Defect SPIDER](#6-how-to-use-defect-spider)
7. [Saved History Board](#7-saved-history-board)
8. [MY EQP Registration](#8-my-eqp-registration)
9. [Troubleshooting](#9-troubleshooting)

## 1. Getting Started

### 1.1 First visit

On your first visit, the `User registration` screen appears.

1. Enter your `knox_id`. Do not enter an email address (no @).
2. Click `Register and continue`.

After you register once, you are recognized automatically when you connect again from the same PC.

### 1.2 Changing the language

On the main screen, click `한국어` / `English` / `中文` at the top right. Your choice is kept for your next visit.

### 1.3 Main screen

| Area | What it shows |
|---|---|
| `Last algorithm run time` | When the anomaly data was last updated |
| App cards | Equipment-Level In-SPEC Anomaly Detection, Similarity Anomaly Detection, Saved History Board, MY EQP Registration, User Manual |
| Connected app card | Defect SPIDER |
| `Line Anomaly Dashboard` | Anomaly status by Line, at the bottom of the main screen |

Click a card to open that app. Click `SPIDER Home` or `Back to home` on any app screen to return to the main screen.

## 2. Common Controls

Choose filters **in order, from left (or top) to right**. Changing an earlier filter clears the filters after it.

- **Select/deselect**: Click an item to select it. Click a selected item again to deselect it.
- **`ALL`**: Shows every item currently in the list at once.
- **Search**: Type in the `Search…` box of a filter card.
  - Use the button to the left of the box to choose `Include` (items containing the text) or `Exclude` (items not containing it).
  - Search is not case-sensitive.
  - If you select `ALL` while searching, **only the items shown in the search results** are included.
- **Filter area size**: Drag the grip at the bottom of the filter area to change its height. Double-click the grip to restore the default size.
- **`Retry`**: Loads the data again with the same conditions after a failure.
- Click the arrow button at the bottom right to go back to the top.

## 3. Line Anomaly Dashboard

Check anomaly status by Line at the bottom of the main screen (the `Dashboard` menu at the top).

1. In `Select Lines`, check the Lines you want. If you check none, `All lines` are shown.
2. Click `Search`.
3. Review the results.

| Area | How to read it |
|---|---|
| KPI cards | Monitored sensors, total anomalies, counts by Grade, and `vs. Previous Day` change (▲ up / ▼ down) |
| `Anomalies by Line` | Anomaly count bars by Line. **Click a bar to show only that Line.** |
| `Daily Anomaly Trend by Line` | Change the range with the period buttons (10/30/90/180 days). Click a legend entry to hide or show that Line. |
| `Line Details` | Click a column header to sort. Click `Details` to open Equipment-Level In-SPEC Anomaly Detection. |

`Reset` returns to all Lines and the 10-day trend, and shows any hidden Lines again.

## 4. Equipment-Level In-SPEC Anomaly Detection

Review anomaly charts by equipment and SKIP them when needed.

### 4.1 Searching

1. Select `Line Name`.
2. Select `SDWT`.
   - `MY EQP`: Shows only your registered MY EQP equipment. This appears only when you have registrations.
   - `SKIP LIST`: Shows only skipped charts.
3. Select `Sensor Grade`. You can select more than one.
   - When you select a grade, the remaining filters (`PRC_Group`, `eqp_ch`, `sensor`, `ch_step`) are set to `ALL`, the status is set to `CRITICAL`, and the charts appear right away.
4. To narrow the results, select `PRC_Group` → `eqp_ch` → `sensor` → `ch_step` in that order.

### 4.2 Viewing charts

| Button | What it does |
|---|---|
| `CRITICAL` / `WARNING` | Shows only anomalies with that status. Click it again to show all. |
| Page numbers | Shows 20 charts per page. |
| `Group ch_steps` / `Show All ch_steps` | Groups the charts of the same EQP, or shows them one by one. (Default: grouped) |
| `Show 3-Day Similarity Chart` | In grouped view, also shows the last 3 days (72 hours) similarity chart on the right. (Default: on) |
| `Similarity Chart` | Opens a window comparing other equipment in the same data. The current EQP is red. Turn on `Draw Reference Lines` and click twice to mark a reference band. |
| `Change History` | Shows equipment work history in a table. If there is a `LINK`, it opens the related page. |
| `Save History` | Saves the chart with an image to the [Saved History Board](#7-saved-history-board). |

Chart controls: **drag to zoom**, **double-click to reset**. Red points are anomaly data, grey points are previous data, and the green dashed line marks change points.

### 4.3 SKIP

| Button | What it does |
|---|---|
| `SKIP` | Excludes the current chart from anomaly detection. Enter a one-line reason (optional) and click `OK`. |
| `EQP ALL SKIP` | Excludes every ch_step of that EQP and sensor at once. |
| `Remove SKIP` | Returns a skipped chart to anomaly detection. |

You can view and remove skipped charts under `SDWT` → `SKIP LIST`. Check the target EQP and sensor before you SKIP.

## 5. Similarity Anomaly Detection

View graphs that compare signal distributions between equipment under the same conditions.

1. Select `Line Name`. (The first Line is selected automatically.)
2. Select `SDWT`. (The first SDWT is selected automatically.)
3. Select `STEP`. `ALL` means every STEP of that SDWT.
4. Select `Sensor`.
5. Select `ch_step` to show the graphs. If Sensor is `ALL`, only `ALL` can be selected for ch_step.

Results appear in `Similarity-Based Anomaly Graphs`, grouped by step_seq.

- 18 graphs are shown per page. Use the page numbers below to move between pages.
- Click `Save History` on a graph to save it to the [Saved History Board](#7-saved-history-board).

## 6. How to Use Defect SPIDER

View anomaly detection results based on defect signals as charts. The data is based on **today's latest anomaly list**.

Some labels on this screen are shown in Korean. They are written below with an English explanation.

### 6.1 Searching

1. Select `Step Type`.
   - `Management Step` (default): anomaly results for management steps
   - `Post-DEPO Step`: anomaly results for steps after DEPO
2. Select `Line Name`. (The first Line is selected automatically.)
3. Select `SDWT`. (The first SDWT is selected automatically.)
4. Select `PRC Group`. The default `ALL` shows the charts of every PRC Group.

When you change `Step Type`, PRC Group returns to `ALL` and the charts are redrawn with the data of the selected step.

### 6.2 Viewing charts

Charts are grouped by PRC Group, with one chart per eqp_ch. The chart title shows `eqp_ch / main_seq / met_seq`.

| Mark | Meaning |
|---|---|
| Small, light points | ALL data (colored by STEP) |
| Large, dark points | Anomaly RAW data (red: NG, teal: others) |
| Green dashed line | Change point (PM history) |
| Legend on the right | STEP colors and counts, and the eqp_ch list. **Click an eqp_ch** to hide or show its points. |

Chart controls:

- **Drag**: zoom into the selected area
- **Drag in the opposite direction**: return to the initial range
- **Double-click** or `범위 초기화` (Reset range): show the full range

### 6.3 Details

- `이상감지 Wafer List 보기` (View anomaly wafer list): Opens the anomaly wafer list as a table. Drag over cells or click a column header to select, then click `복사` (Copy) or press Ctrl+C to paste into Excel.
- `PM이력 보기` (View PM history): Opens the PM history of that equipment as a table.

## 7. Saved History Board

View the charts saved with `Save History` on each screen. You can also click `Go to Saved History Board` in the window that appears right after saving.

1. Enter conditions if needed: `Line Name`, `SDWT`, `Saved by`, `Saved from`, `Saved until`.
   - Line Name, SDWT and Saved by must be entered **exactly** to match.
2. Click `Search` (or press Enter). `Reset` clears all conditions.
3. Click `History details` in the list to see the chart image and information saved at that time.

- Records are shown newest first, 20 per page. Use `Previous` / `Next` to move.
- `Refresh` reloads the current page.
- `Delete history` is visible only to administrators. A deleted record and its image are removed permanently.

## 8. MY EQP Registration

Register equipment you want to watch closely. You can then view only that equipment under `SDWT` → `MY EQP` in Equipment-Level In-SPEC Anomaly Detection.

### 8.1 Registering

1. In `Select equipment reference data`, select `Line Name` → `SDWT` → `PRC Group` → `EQP` in that order.
   - You can select several EQPs. Selecting `ALL` registers every equipment in the list.
2. Check your choices in `Selected conditions`.
3. In `Monitoring period`, enter how many days the registration should stay active (an integer of 1 or more).
4. If needed, add a note in `Notes` (optional, up to 90 characters).
5. In `Viewers and mail recipients`, enter a knox_id and press Enter.
   - Your own knox_id is added automatically.
   - You can add several people. Click the X on a name chip to remove it.
6. Click `Save MY EQP`. The button is enabled only when all required items are filled in.

### 8.2 Checking and deleting registrations

Check the registrations for the selected Line in `Registered MY EQP conditions` at the bottom of the screen.

- Status: `Monitoring` or `Expired`
- You can delete your own registrations with `Delete`. Deleting removes all equipment in that registration.
- You cannot delete another user's public registration.
- Registrations cannot be edited. To change one, delete it and register again.

## 9. Troubleshooting

| Message or symptom | What to do |
|---|---|
| `No data matches the selected filters.` or another no-data message | This may not be an error. Check the earlier filters and your search text. |
| Loading failed | Click `Retry`. If it keeps failing, send the screen, time and selected conditions to the contact person. |
| `Reference mapping error` | Click `Retry`. If it continues, contact the contact person. |
| `Last algorithm run time` shows `Unavailable` | Ask the contact person to check the data update status. |
| Defect SPIDER shows `오늘(…)의 이상감지 목록 폴더가 없습니다.` (today's anomaly list folder is missing) | Today's data has not been created yet. Check again later. |
| `Another knox_id is already registered. Contact the administrator.` | Ask the contact person to change your user registration. |
| `SKIP` or `Save History` is missing or disabled | The chart is still loading, or it has no data to save. |

Do not include passwords or other credentials when you report a problem.

Contacts: see `Development · Operations` at the top of the main screen.

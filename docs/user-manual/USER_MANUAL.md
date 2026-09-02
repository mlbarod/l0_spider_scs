# SPIDER User Manual

> Baseline date: 2026-08-30
> Currently available: Dashboard, Equipment Anomaly Detection, Similarity Anomaly Detection, User Manual

## Contents

1. [Access and Feature Status](#1-access-and-feature-status)
2. [Using the Dashboard](#2-using-the-dashboard)
3. [Equipment Anomaly Detection](#3-equipment-anomaly-detection)
4. [Similarity Anomaly Detection](#4-similarity-anomaly-detection)
5. [Planned Features](#5-planned-features)
6. [Troubleshooting and Precautions](#6-troubleshooting-and-precautions)

## 1. Access and Feature Status

Select a feature card on the SPIDER home screen. Only cards marked `Live` are currently available to users.

| Status | Features |
|---|---|
| Live | Equipment Anomaly Detection, Similarity Anomaly Detection, User Manual |
| Planned | Common Area Anomaly Detection, Common Area Similarity Detection, FDC Hard Limit Recommendations, MY EQP Registration, Defect SPIDER, L1 SPIDER, L3 SPIDER |

The `Line Anomaly Dashboard` below the home screen is live. Selecting a `Planned` card opens a preparation notice instead of a feature screen.

## 2. Using the Dashboard

The Dashboard shows anomaly status and recent trends by Line.

1. Select the query start and end dates.
2. Select the required Lines. If none are selected, all Lines are queried.
3. Select `Search`.
4. Review total monitored sensors, total anomalies, Grade counts, and the previous-day comparison on the KPI cards.
5. Review `Anomalies by Line`, `Daily Anomaly Trend by Line`, and `Line Details`.

`Reset` restores the default filters. `Retry` reloads server data using the current filters. Select a column header in the details table to sort it.

If `Last algorithm run time` at the top of the home screen shows `Unavailable`, contact the operator to check the data status instead of repeatedly refreshing.

## 3. Equipment Anomaly Detection

### 3.1 Filter Order

Select filters from left to right.

1. `Line Name`
2. `SDWT`
3. `Sensor Grade`
4. `PRC_Group`
5. `eqp_ch`
6. `sensor`
7. `ch_step`

Each selection changes the options in the next filter. If the expected value is missing, check the preceding filters, data date, or Sensor exclusion settings. `Retry` reloads data using the current filters.

### 3.2 Reviewing Charts

After all filters are selected, charts are displayed by EQP in the `Scatter chart` area.

- `Group ch_steps`: View multiple `ch_step` values for the same EQP in one area.
- `Show All ch_steps`: Return the grouped view to individual charts.
- `Similarity Chart`: Open similarity data for the selected EQP in a separate window.
- `Show 3-Day Similarity Chart`: Display the last 72 hours similarity chart next to the grouped view.
- `Change History`: Review EQP work history and any available LINK.

A no-data message does not always mean the query failed. First check whether source data exists for the selected filters.

### 3.3 SKIP Actions

`SKIP`, `EQP ALL SKIP`, and `Remove SKIP` are available only when DB capability is enabled and user information is ready.

- `SKIP`: Exclude the current anomaly record.
- `EQP ALL SKIP`: Exclude multiple `ch_step` values for the selected EQP and Sensor.
- `SKIP LIST`: Review excluded records for the Line using the same `PRC_Group` filter order as the standard equipment view.
- `Remove SKIP`: Restore an excluded record.

Before running an action, verify the target EQP, Sensor, and scope. Do not create test SKIP records in the production DB.

## 4. Similarity Anomaly Detection

1. Select `Similarity Anomaly Detection` from the home screen.
2. Select `Line Name`.
3. Select `SDWT`.
4. Select `STEP`.
5. Select `Sensor` and `ch_step`.
6. Review the similarity graphs in the results area.

`ALL` for `ch_step` is a screen selection that groups multiple results for the current filters. It is different from the legacy MY EQP mailing link value `step=ALL`.

Use the page buttons when there are many results. `Retry` reloads the latest path using the current filters.

## 5. Planned Features

The following features appear on the home screen but are not currently available.

- Common Area Anomaly Detection
- Common Area Similarity Detection
- FDC Hard Limit Recommendations
- MY EQP Registration
- Defect SPIDER, L1 SPIDER, L3 SPIDER

Knowing the MY EQP Registration route or a legacy screen address does not mean registration, queries, or email delivery are currently supported. Mailing Report generation and scheduled delivery are also outside the current service scope.

## 6. Troubleshooting and Precautions

| Screen Message or Symptom | What to Check |
|---|---|
| `No data matches the selected filters.` | Check the preceding filters and the data date. |
| Unable to load data | Select `Retry` after a short wait. If the issue continues, provide the URL, time, and selected filters to the operator. |
| DB capability disabled | Queries may remain available, but SKIP and history actions cannot be used. |
| Last run time shows `Unavailable` | Ask the operator to check the latest Dashboard data or connection status. |
| Planned notice | This is not an error; the feature is not yet available. |

Precautions:

- Do not modify browser query parameters to bypass permissions or data restrictions.
- Do not share internal paths or user information shown on the screen outside the organization.
- Do not directly modify production data, the DB, or Sensor settings to reproduce an error.
- Do not include real passwords, tokens, or credentials when reporting an issue.

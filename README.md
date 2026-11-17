# token-radar-01：开工前已经查清的事实

这份文件里的每个数字都是在这个仓库里实际跑出来的，不是估的。

## 竞赛

- 平台 make.fun，slug `token-radar-01`
- 奖金 $1,325，第 1 名 $1,000，第 2-5 名 $50，第 6-10 名 $25
- 截止 2026-12-14 10:00 UTC
- 已报名 10,600+ 个参赛者
- 评判：AI judge 两两对比 dashboard，按胜率排名
- 运行环境：1 CPU / 1 GB 内存 / **120 秒内必须跑完**
- 提交上限：每天 5 次，总共 10 次，最后一次生效

## 工具包位置

`/home/ubuntu/.hermes/cache/scratch/makefun/kit/token-radar-01-kit/`

- `input/snapshot.json` — 密封数据，247 KB
- `starter/` — 能跑的起点（已验证可跑通）

跑法：
```bash
cd /home/ubuntu/.hermes/cache/scratch/makefun/kit/token-radar-01-kit
mkdir -p /tmp/out1
MAKEFUN_OUTPUT_DIR=/tmp/out1 node starter/main.ts --input input/snapshot.json
```

实测输出：`758 protocols, 40 on the watchlist, 200 rows scored (160 early, 24 live set aside)`

## 数据长什么样

758 个协议，TVL ≥ $5M。40 个在 watchlist（TVL ≥ $50M 且没发币且不是 wrapped/staked/bridged）。

字段就十个：slug / name / category / chains / tvl_usd / change_7d / mcap_usd / listed_at / gecko_id / symbol。

## 关键发现：现有模型有一个巨大偏差

starter 的模型是 `implied = tvl_usd × 0.25 × 增长 × 成熟度`。全市场统一 0.25 倍。

**但 watchlist 40 个里有 12 个是 Risk Curators。**

Risk Curators 这个类别在 snapshot 里共 39 个协议，**只有 5 个发过币，发币率 13%**。

现有模型给 Steakhouse Financial（$2.75B TVL）估了 $688M。它是一家风险管理服务商，不是会发币的协议。

各大类的真实发币率和真实估值倍数（从 snapshot 里有币的协议反推）：

| 类别 | 发币率 | mcap/TVL 中位 | 样本 |
|---|---|---|---|
| Cross Chain Bridge | 86% | 1.220 | 4 |
| Lending | 79% | 0.132 | 15 |
| Dexs | 74% | 0.342 | 11 |
| Basis Trading | 62% | 0.654 | 7 |
| Yield Aggregator | 61% | 0.151 | 4 |
| Yield | 59% | 0.180 | 10 |
| Canonical Bridge | 53% | 0.746 | 8 |
| RWA | 52% | 0.275 | 9 |
| Liquid Staking | 51% | 0.041 | 9 |
| CDP | 50% | 0.169 | 3 |
| Bridge | 49% | 0.557 | 6 |
| CEX | 25% | 0.075 | 9 |
| **Risk Curators** | **13%** | 样本不足 | 1 |

全市场基准：倍数中位 **0.205**，整体发币率 **55%**。

## 建议的模型方向

用「同类可比 + 发币概率」算期望值，而不是固定倍数：

```
期望值 = TVL × 该类已发币协议的 mcap/TVL 中位数 × 该类发币率 × 增长调整 × 成熟度调整
```

类别样本不足时（倍数样本 < 3 或类别总数 < 6），回退到全市场基准（0.205 / 55%）。

我在 `/home/ubuntu/.hermes/cache/scratch/makefun/model_v2.py` 里按这个思路算过一遍，结果是：

- Steakhouse 从 $688M → $57M
- 新榜首：Veda（$1.56B TVL 的资本分配器）$79M、USDD（$1.06B 的 CDP）$72M、Bittensor dTAO $57M
- Tori Finance 和 Axis（Basis Trading，发币率 62%、倍数 0.654）排名明显上升

这个脚本是草稿，不是最终实现，可以推翻重写。核心思路是「每个类别用同类数据说话」，不要对任何具体协议名字特判。

## 交付要求

- `main.ts` 在仓库根目录（Node 22）
- `board.json` 至少 100 行，watchlist 40 个全覆盖
- `dashboard/` 静态页，无网络也能渲染
- `screenshots/` 3 张：榜单、某协议详情、筛选视图
- `dossier.json`
- OSI 协议（MIT）
- README 带 make.fun 徽章，GitHub About 链接 make.fun

## 评分要点

AI judge 两两对比页面，看的是**信息密度、可读性、有说服力的推理**。

不是比算法多复杂，是比页面能不能让一个做 DeFi 的人一眼看懂「为什么这个协议该排前面」。

所以 dashboard 上要有：
- 榜单本身
- 每个协议的详情（TVL、类别、倍数怎么来的、发币概率、farm 步骤）
- 一个能筛选的视图
- 说清楚模型的假设和局限

## 提交注意

提交要带 AI 会话记录。当前这个仓库的代码必须在「竞赛窗口内（2026-11-14 10:00 UTC 之后）开始的会话」里写，早于这个时间的会话会被 `thinking_in_window` 拒掉。

所以：**从这个文件开始，所有代码都在新会话里写。**

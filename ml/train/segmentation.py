"""Client segmentation: k-means on payment behaviour and value, then readable segment names.

Clients with fewer than MIN_INVOICES issued invoices are not clustered (too little history)
and get the NEW segment. Payment-behaviour features weigh BEHAVIOUR_WEIGHT times more than
value/activity features (the segments are meant to guide collection). The number of clusters
is chosen by silhouette score between K_RANGE bounds (at least 4, so reliable, occasionally
late and slow-paying clients are not merged). Each cluster
is then named from its average profile with fixed, documented rules, so the app shows
stable, translatable segment codes rather than arbitrary cluster numbers.
"""

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import adjusted_rand_score, silhouette_score
from sklearn.preprocessing import StandardScaler

MIN_INVOICES = 3
BEHAVIOUR_WEIGHT = 2.0
K_RANGE = range(4, 7)
PRIOR_STRENGTH = 3  # same late-rate smoothing as the late-payment model
SEGMENTS = ["KEY_ACCOUNT", "RELIABLE", "OCCASIONAL_LATE", "SLOW_PAYER", "INACTIVE", "NEW"]


BEHAVIOUR = ["late_rate", "avg_days_late", "overdue_share"]


def _smoothed_late_rate(clients: pd.DataFrame, global_late_rate: float) -> pd.Series:
    return (clients.late_count + PRIOR_STRENGTH * global_late_rate) / (clients.known_outcomes + PRIOR_STRENGTH)


def _features(clients: pd.DataFrame, global_late_rate: float) -> pd.DataFrame:
    x = pd.DataFrame(index=clients.index)
    x["late_rate"] = _smoothed_late_rate(clients, global_late_rate)
    x["avg_days_late"] = clients.avg_days_late.fillna(0).clip(-30, 120)
    x["overdue_share"] = (clients.overdue_amount / clients.total_revenue.where(clients.total_revenue > 0)).fillna(0)
    x["log_revenue"] = np.log1p(clients.total_revenue)
    x["invoices_per_month"] = clients.invoices_per_month.fillna(0)
    x["recency_days"] = clients.recency_days.fillna(clients.tenure_days).clip(upper=365)
    return x


def _name(profile: pd.Series, revenue_q75: float) -> str:
    if profile.late_rate >= 0.5:
        return "SLOW_PAYER"
    if profile.recency_days >= 120:
        return "INACTIVE"
    if profile.total_revenue >= revenue_q75 and profile.late_rate < 0.35:
        return "KEY_ACCOUNT"
    if profile.late_rate < 0.15:
        return "RELIABLE"
    return "OCCASIONAL_LATE"


def run(clients: pd.DataFrame, personas: pd.DataFrame | None) -> tuple[pd.DataFrame, dict]:
    eligible = clients[clients.invoice_count >= MIN_INVOICES].copy()
    global_rate = float(eligible.late_count.sum() / max(1, eligible.known_outcomes.sum()))
    features = _features(eligible, global_rate)
    x = StandardScaler().fit_transform(features)
    x[:, [features.columns.get_loc(c) for c in BEHAVIOUR]] *= BEHAVIOUR_WEIGHT

    silhouettes = {}
    models = {}
    for k in K_RANGE:
        model = KMeans(n_clusters=k, n_init=20, random_state=0).fit(x)
        silhouettes[k] = round(float(silhouette_score(x, model.labels_)), 3)
        models[k] = model
    k = max(silhouettes, key=silhouettes.get)
    eligible["cluster"] = models[k].labels_
    eligible["late_rate"] = _smoothed_late_rate(eligible, global_rate)

    revenue_q75 = float(eligible.total_revenue.quantile(0.75))
    profiles = eligible.groupby("cluster").agg(
        clients=("client_id", "count"), late_rate=("late_rate", "mean"), avg_days_late=("avg_days_late", "mean"),
        total_revenue=("total_revenue", "mean"), recency_days=("recency_days", "mean"),
        invoices_per_month=("invoices_per_month", "mean"),
    )
    profiles["segment"] = [_name(p, revenue_q75) for _, p in profiles.iterrows()]
    eligible["segment"] = eligible.cluster.map(profiles.segment)

    result = clients[["client_id"]].merge(eligible[["client_id", "cluster", "segment"]], on="client_id", how="left")
    result["segment"] = result.segment.fillna("NEW")
    result["cluster"] = result.cluster.astype("Int64")

    metrics = {
        "clustered_clients": len(eligible),
        "new_clients_not_clustered": int((result.segment == "NEW").sum()),
        "silhouette_by_k": silhouettes,
        "chosen_k": k,
        "segment_counts": result.segment.value_counts().to_dict(),
        "cluster_profiles": profiles.round(3).reset_index().to_dict(orient="records"),
    }
    if personas is not None:
        merged = result.merge(personas, on="client_id")
        metrics["adjusted_rand_vs_personas"] = round(float(adjusted_rand_score(merged.persona, merged.segment)), 3)
        metrics["segment_by_persona"] = pd.crosstab(merged.persona, merged.segment).to_dict(orient="index")
    return result[["client_id", "segment", "cluster"]], metrics

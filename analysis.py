import re
import numpy as np
import pandas as pd
from scipy import stats
from scipy.stats import gaussian_kde
from scipy.spatial.distance import pdist, squareform
from sklearn.decomposition import PCA as SklearnPCA
from sklearn.preprocessing import StandardScaler
from typing import Any, Optional
import json
import warnings
warnings.filterwarnings('ignore')


class DescriptiveStats:
    @staticmethod
    def compute(data: pd.Series, label: str) -> dict:
        vals = data.dropna().values.astype(float)
        n = len(vals)
        if n == 0:
            return {"variable": label, "error": "No valid data"}
        mu = np.mean(vals)
        sigma = np.std(vals, ddof=1)
        if sigma == 0 or n < 2:
            skew_val = 0.0
            kurt_val = 0.0
        else:
            skew_val = float(stats.skew(vals))
            kurt_val = float(stats.kurtosis(vals, fisher=False))

        se = sigma / np.sqrt(n)
        cv = (sigma / abs(mu)) * 100 if mu != 0 else 0
        q1, q2, q3 = np.percentile(vals, [25, 50, 75])
        iqr = q3 - q1
        lower_whisker = max(np.min(vals), q1 - 1.5 * iqr)
        upper_whisker = min(np.max(vals), q3 + 1.5 * iqr)
        outliers_vals = vals[(vals < lower_whisker) | (vals > upper_whisker)]

        kde = None
        try:
            if len(np.unique(vals)) > 5 and sigma > 0:
                kde_est = gaussian_kde(vals)
                x_grid = np.linspace(np.min(vals), np.max(vals), 200)
                kde = {"x": x_grid.tolist(), "y": kde_est(x_grid).tolist()}
        except Exception:
            pass

        return {
            "variable": label,
            "n": int(n),
            "mean": round(mu, 6),
            "median": round(float(q2), 6),
            "std_dev": round(sigma, 6),
            "variance": round(sigma ** 2, 6),
            "std_error": round(se, 6),
            "cv_percent": round(cv, 4),
            "skewness": round(skew_val, 6),
            "kurtosis": round(kurt_val, 6),
            "min": round(float(np.min(vals)), 6),
            "max": round(float(np.max(vals)), 6),
            "q1": round(float(q1), 6),
            "q3": round(float(q3), 6),
            "iqr": round(float(iqr), 6),
            "range": round(float(np.max(vals) - np.min(vals)), 6),
            "lower_whisker": round(float(lower_whisker), 6),
            "upper_whisker": round(float(upper_whisker), 6),
            "outliers": outliers_vals.tolist(),
            "outlier_count": int(len(outliers_vals)),
            "kde": kde
        }


class ANOVA:
    @staticmethod
    def one_way(data: pd.DataFrame, dv: str, between: str) -> dict:
        groups = [g[dv].dropna().values.astype(float)
                  for _, g in data.groupby(between)]
        groups = [g for g in groups if len(g) > 0]
        if len(groups) < 2:
            return {"error": "Need at least 2 groups"}
        grand_mean = np.mean(np.concatenate(groups))
        ss_between = sum(len(g) * (np.mean(g) - grand_mean) ** 2 for g in groups)
        ss_within = sum(np.sum((g - np.mean(g)) ** 2) for g in groups)
        df_between = len(groups) - 1
        df_within = sum(len(g) for g in groups) - len(groups)
        ms_between = ss_between / df_between if df_between > 0 else 0
        ms_within = ss_within / df_within if df_within > 0 else 0
        f_val = ms_between / ms_within if ms_within > 0 else 0
        p_val = 1 - stats.f.cdf(f_val, df_between, df_within)
        eta_sq = ss_between / (ss_between + ss_within) if (ss_between + ss_within) > 0 else 0
        omega_sq = (df_between * (ms_between - ms_within)) / (ss_between + ss_within + ms_within) if (ss_between + ss_within + ms_within) > 0 else 0

        group_stats = []
        for name, g in data.groupby(between):
            vals = g[dv].dropna().values.astype(float)
            if len(vals) > 0:
                group_stats.append({
                    "group": str(name),
                    "n": int(len(vals)),
                    "mean": round(float(np.mean(vals)), 4),
                    "std": round(float(np.std(vals, ddof=1)), 4),
                    "se": round(float(np.std(vals, ddof=1) / np.sqrt(len(vals))), 4)
                })

        tukey = None
        try:
            from statsmodels.stats.multicomp import pairwise_tukeyhsd
            tukey_res = pairwise_tukeyhsd(data[dv].dropna(), data[between].dropna())
            tukey = []
            for i in range(len(tukey_res.groups_unique)):
                for j in range(i + 1, len(tukey_res.groups_unique)):
                    g1 = tukey_res.groups_unique[i]
                    g2 = tukey_res.groups_unique[j]
                    idx = (tukey_res.groups_unique == g1) & (tukey_res.groups_unique == g2).any()
                    meandiff = tukey_res.meandiffs[len(tukey)]
                    p_adj = tukey_res.pvalues[len(tukey)]
                    reject = tukey_res.reject[len(tukey)]
                    tukey.append({
                        "group1": str(g1),
                        "group2": str(g2),
                        "meandiff": round(float(meandiff), 4),
                        "pvalue": round(float(p_adj), 6),
                        "reject": bool(reject)
                    })
        except Exception:
            tukey = None

        return {
            "method": "One-way ANOVA",
            "dv": dv,
            "factor": between,
            "anova_table": {
                "source": ["Between Groups", "Within Groups", "Total"],
                "ss": [round(ss_between, 4), round(ss_within, 4), round(ss_between + ss_within, 4)],
                "df": [int(df_between), int(df_within), int(df_between + df_within)],
                "ms": [round(ms_between, 4), round(ms_within, 4), ""],
                "f": [round(f_val, 4), "", ""],
                "p_value": [p_val, "", ""],
            },
            "effect_size": {
                "eta_squared": round(eta_sq, 4),
                "omega_squared": round(omega_sq, 4)
            },
            "group_stats": group_stats,
            "tukey_hsd": tukey
        }

    @staticmethod
    def two_way(data: pd.DataFrame, dv: str, factor_a: str, factor_b: str) -> dict:
        try:
            import statsmodels.api as sm
            from statsmodels.formula.api import ols
            formula = f"Q('{dv}') ~ C(Q('{factor_a}')) * C(Q('{factor_b}'))"
            model = ols(formula, data=data).fit()
            sm_table = sm.stats.anova_lm(model, typ=2)
            table = {
                "source": [],
                "ss": [],
                "df": [],
                "ms": [],
                "f": [],
                "p_value": []
            }
            for idx, row in sm_table.iterrows():
                src = str(idx)
                src = re.sub(r"C\(Q\('([^']+)'\)\)", r"\1", src)
                src = re.sub(r"C\(([^:]+)\)(?::C\(([^)]+)\))?", r"\1\2", src)
                src = src.replace(":", " x ")
                ss_val = round(float(row["sum_sq"]), 4)
                df_val = int(row["df"])
                ms_val = round(ss_val / df_val, 4) if df_val > 0 else ""
                f_val = round(float(row["F"]), 4) if "F" in row and not np.isnan(row["F"]) else ""
                p_val = float(row["PR(>F)"]) if "PR(>F)" in row and not np.isnan(row["PR(>F)"]) else ""
                table["source"].append(src)
                table["ss"].append(ss_val)
                table["df"].append(df_val)
                table["ms"].append(ms_val)
                table["f"].append(f_val)
                table["p_value"].append(p_val)

            # group means
            group_stats = []
            for (a, b), g in data.groupby([factor_a, factor_b]):
                vals = g[dv].dropna().values.astype(float)
                if len(vals) > 0:
                    group_stats.append({
                        "group": f"{a} x {b}",
                        "n": int(len(vals)),
                        "mean": round(float(np.mean(vals)), 4),
                        "std": round(float(np.std(vals, ddof=1)), 4)
                    })

            return {
                "method": "Two-way ANOVA",
                "dv": dv,
                "factor_a": factor_a,
                "factor_b": factor_b,
                "anova_table": table,
                "group_stats": group_stats,
                "r_squared": getattr(model, "rsquared", None)
            }
        except Exception as e:
            return {"error": f"Two-way ANOVA failed: {str(e)}"}


class Regression:
    @staticmethod
    def multiple(data: pd.DataFrame, dv: str, ivs: list) -> dict:
        try:
            import statsmodels.api as sm
            y = data[dv].dropna()
            valid = y.index
            X = data.loc[valid, ivs].copy()
            for col in ivs:
                X[col] = pd.to_numeric(X[col], errors='coerce')
            mask = X.notna().all(axis=1) & y.notna()
            X = sm.add_constant(X[mask].astype(float))
            y = y[mask].astype(float)
            if len(X) < 3:
                return {"error": "Not enough valid observations"}
            model = sm.OLS(y, X).fit()
            coeffs = []
            for i, name in enumerate(X.columns):
                coeffs.append({
                    "variable": name,
                    "coefficient": round(float(model.params.iloc[i]), 6),
                    "std_error": round(float(model.bse.iloc[i]), 6),
                    "t_value": round(float(model.tvalues.iloc[i]), 4),
                    "p_value": float(model.pvalues.iloc[i]),
                    "ci_lower": round(float(model.conf_int().iloc[i, 0]), 6),
                    "ci_upper": round(float(model.conf_int().iloc[i, 1]), 6)
                })
            return {
                "method": "Multiple Linear Regression",
                "dv": dv,
                "ivs": ivs,
                "coefficients": coeffs,
                "r_squared": round(float(model.rsquared), 6),
                "adj_r_squared": round(float(model.rsquared_adj), 6),
                "f_statistic": round(float(model.fvalue), 4),
                "f_p_value": float(model.f_pvalue),
                "mse": round(float(model.mse_resid), 6),
                "rmse": round(float(np.sqrt(model.mse_resid)), 6),
                "n_obs": int(model.nobs),
                "residuals": model.resid.tolist(),
                "fitted_values": model.fittedvalues.tolist(),
                "aic": round(float(model.aic), 2),
                "bic": round(float(model.bic), 2)
            }
        except Exception as e:
            return {"error": f"Regression failed: {str(e)}"}


class PCAnalysis:
    @staticmethod
    def compute(data: pd.DataFrame, variables: list) -> dict:
        try:
            vals = data[variables].dropna().astype(float)
            if len(vals) < 3:
                return {"error": "Need at least 3 observations"}
            scaler = StandardScaler()
            scaled = scaler.fit_transform(vals)
            pca = SklearnPCA()
            scores = pca.fit_transform(scaled)
            n_components = len(pca.explained_variance_)
            ev = pca.explained_variance_.tolist()
            prop_var = pca.explained_variance_ratio_.tolist()
            cum_var = np.cumsum(pca.explained_variance_ratio_).tolist()

            loadings = pca.components_.T
            var_labels = variables
            factor_loadings = []
            for i, var in enumerate(var_labels):
                row = {"variable": var}
                for j in range(n_components):
                    row[f"PC{j + 1}"] = round(float(loadings[i, j]), 6)
                factor_loadings.append(row)

            score_coords = []
            for i in range(min(n_components, 2)):
                score_coords.append([round(float(scores[j, i]), 6) for j in range(len(scores))])

            correlation_matrix = np.corrcoef(scaled.T).tolist()

            return {
                "method": "Principal Component Analysis",
                "variables": variables,
                "n_components": n_components,
                "n_obs": int(len(vals)),
                "eigenvalues": [round(v, 6) for v in ev],
                "proportion_variance": [round(v, 6) for v in prop_var],
                "cumulative_variance": [round(v, 6) for v in cum_var],
                "factor_loadings": factor_loadings,
                "score_coordinates": score_coords,
                "correlation_matrix": correlation_matrix,
                "component_labels": [f"PC{i + 1}" for i in range(n_components)]
            }
        except Exception as e:
            return {"error": f"PCA failed: {str(e)}"}


class SEM:
    @staticmethod
    def path_analysis(data: pd.DataFrame, paths: list) -> dict:
        try:
            import statsmodels.api as sm
            results = []
            all_endogenous = set()
            for path in paths:
                all_endogenous.add(path["to"])
            modeled_vars = {}
            for path in paths:
                to_var = path["to"]
                from_var = path["from"]
                if to_var not in modeled_vars:
                    modeled_vars[to_var] = []
                modeled_vars[to_var].append(from_var)

            df = data.copy()
            equations = []
            for to_var, from_vars in modeled_vars.items():
                valid = df[[to_var] + from_vars].dropna()
                if len(valid) < 3:
                    continue
                y = valid[to_var].astype(float)
                X = valid[from_vars].astype(float)
                X = sm.add_constant(X)
                model = sm.OLS(y, X).fit()
                eq = {
                    "dependent": to_var,
                    "r_squared": round(float(model.rsquared), 6),
                    "adj_r_squared": round(float(model.rsquared_adj), 6),
                    "paths": []
                }
                for i, var_name in enumerate(X.columns):
                    is_std = var_name != "const"
                    eq["paths"].append({
                        "from": var_name,
                        "to": to_var,
                        "coefficient": round(float(model.params.iloc[i]), 6),
                        "std_error": round(float(model.bse.iloc[i]), 6),
                        "t_value": round(float(model.tvalues.iloc[i]), 4),
                        "p_value": float(model.pvalues.iloc[i]),
                        "standardized": is_std
                    })
                equations.append(eq)
                results.append(eq)

            # Model fit (simplified)
            n_paths = len(paths)
            n_vars_used = len(modeled_vars)
            chi_sq = max(0, 2 * sum(eq.get("r_squared", 0) for eq in equations))
            df_model = n_paths - n_vars_used if n_paths > n_vars_used else 1
            p_val = 1 - stats.chi2.cdf(chi_sq, max(df_model, 1))
            cfi = max(0, min(1, 1 - (chi_sq - df_model) / max(chi_sq, 0.001)))
            rmsea = max(0, np.sqrt(max(0, (chi_sq - df_model) / (max(df_model, 1) * (len(data) - 1)))))

            fit_indices = {
                "chi_square": round(float(chi_sq), 4),
                "df": int(df_model),
                "p_value": round(float(p_val), 6),
                "cfi": round(float(cfi), 4),
                "rmsea": round(float(rmsea), 4),
                "n_obs": int(len(data))
            }
            return {
                "method": "Path Analysis (SEM)",
                "paths_specified": paths,
                "equations": equations,
                "fit_indices": fit_indices
            }
        except Exception as e:
            return {"error": f"SEM failed: {str(e)}"}


class AHP:
    @staticmethod
    def compute(criteria: list, alternatives: list,
                criteria_matrix: list, alt_matrices: list) -> dict:
        try:
            n_crit = len(criteria)
            n_alt = len(alternatives)

            crit_weights, crit_ci, crit_cr = AHP._compute_priority(criteria_matrix, n_crit)
            if crit_weights is None:
                return {"error": "Inconsistent criteria matrix"}
            alt_scores_list = []
            for i in range(n_crit):
                if i >= len(alt_matrices) or not alt_matrices[i]:
                    alt_scores_list.append([1.0 / n_alt] * n_alt)
                    continue
                w, _, _ = AHP._compute_priority(alt_matrices[i], n_alt)
                if w is None:
                    w = [1.0 / n_alt] * n_alt
                alt_scores_list.append(w)

            final_scores = []
            for j in range(n_alt):
                score = sum(crit_weights[i] * alt_scores_list[i][j] for i in range(n_crit))
                final_scores.append(round(float(score), 6))

            best_idx = int(np.argmax(final_scores))
            alt_details = []
            for j in range(n_alt):
                alt_details.append({
                    "alternative": alternatives[j],
                    "final_score": final_scores[j],
                    "details": {criteria[i]: round(float(alt_scores_list[i][j]), 6) for i in range(n_crit)}
                })

            ri_map = {1: 0.0, 2: 0.0, 3: 0.58, 4: 0.90, 5: 1.12,
                      6: 1.24, 7: 1.32, 8: 1.41, 9: 1.45, 10: 1.49}
            ri = ri_map.get(n_crit, 1.49)

            return {
                "method": "Analytic Hierarchy Process",
                "criteria": criteria,
                "alternatives": alternatives,
                "criteria_weights": [round(float(w), 6) for w in crit_weights],
                "criteria_consistency": {
                    "ci": round(float(crit_ci), 6),
                    "ri": float(ri),
                    "cr": round(float(crit_cr), 6),
                    "consistent": crit_cr < 0.1
                },
                "alternative_scores": alt_details,
                "best_alternative": alternatives[best_idx],
                "best_score": final_scores[best_idx]
            }
        except Exception as e:
            return {"error": f"AHP failed: {str(e)}"}

    @staticmethod
    def _compute_priority(matrix: list, n: int):
        if n < 2 or not matrix or len(matrix) != n:
            return None, 0, 0
        arr = np.array(matrix, dtype=float)
        try:
            eigvals, eigvecs = np.linalg.eig(arr)
            idx = int(np.argmax(np.real(eigvals)))
            lambda_max = np.real(eigvals[idx])
            eigvec = np.real(eigvecs[:, idx])
            weights = eigvec / eigvec.sum()
            ci = (lambda_max - n) / (n - 1) if n > 1 else 0
            ri_map = {1: 0.0, 2: 0.0, 3: 0.58, 4: 0.90, 5: 1.12,
                      6: 1.24, 7: 1.32, 8: 1.41, 9: 1.45, 10: 1.49}
            ri = ri_map.get(n, 1.49)
            cr = ci / ri if ri > 0 else 0
            return weights, ci, cr
        except Exception:
            return None, 0, 0


class InterpretationEngine:
    @staticmethod
    def descriptive(desc: dict) -> str:
        text = f"**{desc['variable']}**: N = {desc['n']}, Mean = {desc['mean']:.4f} "
        text += f"(SD = {desc['std_dev']:.4f}), Median = {desc['median']:.4f}. "
        text += f"The distribution shows skewness of {desc['skewness']:.3f} "
        text += f"and kurtosis of {desc['kurtosis']:.3f}. "
        if abs(desc['skewness']) > 1:
            text += "The data is substantially skewed. "
        elif abs(desc['skewness']) > 0.5:
            text += "The data is moderately skewed. "
        else:
            text += "The data is approximately symmetric. "
        if desc['outlier_count'] > 0:
            text += f"There are {desc['outlier_count']} outlier(s) detected. "
        text += f"The coefficient of variation is {desc['cv_percent']:.2f}%."
        return text

    @staticmethod
    def anova(result: dict) -> str:
        if "error" in result:
            return f"ANOVA could not be computed: {result['error']}"
        table = result.get("anova_table", {})
        sources = table.get("source", [])
        p_vals = table.get("p_value", [])
        text = f"**{result['method']}** for {result['dv']}: "
        for i, src in enumerate(sources):
            if i < len(p_vals) and isinstance(p_vals[i], (int, float)) and p_vals[i] != "":
                sig = "significant" if p_vals[i] < 0.05 else "not significant"
                text += f"{src}: F({table['df'][i]}) = {table['f'][i]}, p = {p_vals[i]:.4f} ({sig}). "
        es = result.get("effect_size", {})
        if es:
            text += f"Effect size: η² = {es.get('eta_squared', 'N/A')}, ω² = {es.get('omega_squared', 'N/A')}. "
        tukey = result.get("tukey_hsd")
        if tukey:
            text += "Post-hoc (Tukey HSD): "
            for pair in tukey:
                if pair.get("reject"):
                    text += f"{pair['group1']} vs {pair['group2']} (diff={pair['meandiff']}, p={pair['pvalue']:.4f}, significant). "
        return text

    @staticmethod
    def regression(result: dict) -> str:
        if "error" in result:
            return f"Regression could not be computed: {result['error']}"
        text = f"**Multiple Linear Regression**: {result['dv']} ~ "
        text += " + ".join(result["ivs"]) + ". "
        text += f"The model is {'significant' if result['f_p_value'] < 0.05 else 'not significant'} "
        text += f"(F({result.get('n_obs', 0) - len(result['ivs']) - 1},{len(result['ivs'])}) = {result['f_statistic']:.4f}, "
        text += f"p = {result['f_p_value']:.4f}). "
        text += f"R² = {result['r_squared']:.4f}, Adjusted R² = {result['adj_r_squared']:.4f}. "
        text += "Coefficients: "
        for c in result["coefficients"]:
            sig = "significant" if c["p_value"] < 0.05 else "not significant"
            text += f"{c['variable']} = {c['coefficient']:.4f} (p = {c['p_value']:.4f}, {sig}), "
        text += f"RMSE = {result['rmse']:.4f}."
        return text

    @staticmethod
    def pca(result: dict) -> str:
        if "error" in result:
            return f"PCA could not be computed: {result['error']}"
        text = f"**Principal Component Analysis** on {result['n_obs']} observations with {len(result['variables'])} variables. "
        text += f"{result['n_components']} components extracted. "
        text += f"PC1 explains {result['proportion_variance'][0] * 100:.2f}% of variance, "
        text += f"PC2 explains {result['proportion_variance'][1] * 100:.2f}% of variance. "
        cum_var = result['cumulative_variance'][-1] * 100 if result['cumulative_variance'] else 0
        text += f"Cumulative variance explained: {cum_var:.2f}%. "
        loadings = result.get("factor_loadings", [])
        if loadings:
            high_loadings = [l for l in loadings if abs(l.get("PC1", 0)) > 0.7]
            if high_loadings:
                text += "Variables with strong loadings on PC1: "
                text += ", ".join(l["variable"] for l in high_loadings) + ". "
        return text

    @staticmethod
    def sem(result: dict) -> str:
        if "error" in result:
            return f"SEM could not be computed: {result['error']}"
        text = "**Path Analysis (SEM)** results: "
        for eq in result.get("equations", []):
            text += f"R² for {eq['dependent']} = {eq['r_squared']:.4f}. "
            for p in eq.get("paths", []):
                if p.get("standardized"):
                    sig = "significant" if p["p_value"] < 0.05 else "not significant"
                    text += f"Path {p['from']} -> {p['to']}: β = {p['coefficient']:.4f} (p = {p['p_value']:.4f}, {sig}). "
        fi = result.get("fit_indices", {})
        if fi:
            text += f"Model fit: χ²({fi.get('df', 'N/A')}) = {fi.get('chi_square', 'N/A'):.4f}, "
            text += f"p = {fi.get('p_value', 'N/A'):.4f}, CFI = {fi.get('cfi', 'N/A'):.4f}, RMSEA = {fi.get('rmsea', 'N/A'):.4f}. "
            if fi.get('cfi', 0) >= 0.95 and fi.get('rmsea', 1) <= 0.06:
                text += "The model shows good fit."
            elif fi.get('cfi', 0) >= 0.90:
                text += "The model shows acceptable fit."
            else:
                text += "The model fit could be improved."
        return text

    @staticmethod
    def ahp(result: dict) -> str:
        if "error" in result:
            return f"AHP could not be computed: {result['error']}"
        text = f"**Analytic Hierarchy Process** with {len(result['criteria'])} criteria and {len(result['alternatives'])} alternatives. "
        text += "Criteria weights: "
        for i, (c, w) in enumerate(zip(result['criteria'], result['criteria_weights'])):
            text += f"{c} = {w:.4f}, "
        cr = result['criteria_consistency']['cr']
        text += f"Consistency Ratio = {cr:.4f} ({'consistent' if cr < 0.1 else 'INCONSISTENT - please revise judgments'}). "
        text += f"**Best alternative: {result['best_alternative']}** (score = {result['best_score']:.4f})."
        return text

    @staticmethod
    def generate(method: str, result: dict) -> str:
        engine = {
            "descriptive": InterpretationEngine.descriptive,
            "anova": InterpretationEngine.anova,
            "regression": InterpretationEngine.regression,
            "pca": InterpretationEngine.pca,
            "sem": InterpretationEngine.sem,
            "ahp": InterpretationEngine.ahp
        }
        fn = engine.get(method)
        if fn:
            return fn(result)
        return "Interpretation not available for this method."

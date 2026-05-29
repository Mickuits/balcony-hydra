# ============================================================
# coverage.py — Hook SCons pour l'env native_cov
#
# `pio test` n'applique pas `link_flags` à l'édition de liens du
# runner de test natif. Ce pre-script injecte `--coverage` dans
# LINKFLAGS pour que libgcov soit liée (sinon __gcov_init undefined).
# Référencé via `extra_scripts = pre:coverage.py` dans [env:native_cov].
# ============================================================
Import("env")  # noqa: F821  (fourni par SCons/PlatformIO)

env.Append(LINKFLAGS=["--coverage"])

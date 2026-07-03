$ErrorActionPreference = 'Stop'

# Windows main development uses the real source project. Stop hooks must not
# sync the preview mirror or close DevTools.
exit 0

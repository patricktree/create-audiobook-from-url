entire_binary=$(command -v entire || true)
if [ -z "${entire_binary}" ] && [ -x /opt/homebrew/bin/entire ]; then
    entire_binary=/opt/homebrew/bin/entire
fi

if [ -n "${entire_binary}" ]; then
    "${entire_binary}" hooks git "$@"
else
    printf '%s\n' '[entire] CLI unavailable; skipping session capture hook.' >&2
fi

#!/bin/sh
set -eu

# 测试密码只从容器环境变量注入，不写入镜像层或仓库文件。
if [ -z "${TEST_PASSWORD:-}" ]; then
  echo "TEST_PASSWORD is required" >&2
  exit 1
fi

echo "obsidian-test:${TEST_PASSWORD}" | chpasswd
ssh-keygen -A

cat >> /etc/ssh/sshd_config <<'EOF'
PasswordAuthentication yes
PermitRootLogin no
UsePAM no
AllowUsers obsidian-test
EOF

exec /usr/sbin/sshd -D -e

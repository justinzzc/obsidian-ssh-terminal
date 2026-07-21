FROM alpine:3.21

RUN apk add --no-cache openssh-server \
    && adduser -D -s /bin/sh obsidian-test \
    && mkdir -p /run/sshd

COPY entrypoint.sh /entrypoint.sh
RUN chmod 0755 /entrypoint.sh

EXPOSE 22
ENTRYPOINT ["/entrypoint.sh"]

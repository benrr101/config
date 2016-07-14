# .bashrc

# Source global definitions
if [ -f /etc/bashrc ]; then
	. /etc/bashrc
fi

# Uncomment the following line if you don't like systemctl's auto-paging feature:
# export SYSTEMD_PAGER=

# User specific aliases and functions


# Useful aliases
alias ls="ls --color=auto"
alias ll="ls -la"
alias dir="ls"
alias cls="clear"
alias grep="grep --color=auto"


# Override the PS1 to the RHEL style one
export PS1="[\u@\h \[\033[38;5;6m\]\W\[$(tput sgr0)\]]\\$ "

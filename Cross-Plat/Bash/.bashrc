# .bashrc

# GLOBAL DEFS ##############################################################
if [ -f /etc/bashrc ]; then
	. /etc/bashrc
fi

# OS SPECIFIC ALIASES ######################################################
PLATFORM=`uname`
if [[ "$PLATFORM" == 'Darwin' ]]
then
  alias ls='ls -G'
else
  alias ls='ls --color=auto'
fi

# USEFUL ALIASES ###########################################################
alias ll="ls -la"
alias dir="ls"
alias cls="clear"
alias grep="grep --color=auto"

# RHEL PROMPT ##############################################################
export PS1="[\u@\h \[\033[38;5;6m\]\W\[$(tput sgr0)\]]\\$ "

# CUSTOM FUNCTIONALITY #####################################################
. ./.bash_git.sh

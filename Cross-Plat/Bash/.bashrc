# .bashrc

PLATFORM=`uname`

# GLOBAL DEFS ##############################################################
if [ -f /etc/bashrc ]; then
	. /etc/bashrc
fi

# OS SPECIFIC DEFS #########################################################
if [[ "$PLATFORM" == 'Darwin' ]]
then
  # Disable the dumb "zsh is default" warning
  export BASH_SILENCE_DEPRECATION_WARNING=1
fi

# OS SPECIFIC ALIASES ######################################################
## ls
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
## Git tab-completion
. ~/.bash_git.sh

## rbenv initialization
which rbenv > /dev/null
if [[ $? -eq 0 ]]
then
    eval "$(rbenv init -)"
fi


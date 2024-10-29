# ~/.bashrc

PLATFORM=`uname`

# GLOBAL DEFS ##############################################################
if [ -f /etc/bashrc ]; then
	. /etc/bashrc
fi

if [[ "$PLATFORM" == 'cygwin' ]] || [[ "$PLATFORM" == 'msys' ]]
then
  NULL=NUL
else
  NULL=/dev/null
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
if [[ -t 1 ]]
then
  # Only change prompt if we're in an interactive terminal
  export PS1="[\u@\h \[\033[38;5;6m\]\W\[$(tput sgr0)\]]\\$ "
fi

# CUSTOM FUNCTIONALITY #####################################################
## Git tab-completion
. ~/.bash_git.sh

## rbenv initialization
which rbenv > $NULL 2>&1
if [[ $? -eq 0 ]]
then
    eval "$(rbenv init -)"
fi

# SOURCE PROFILE ###########################################################
# In interactive shells, .profile is not loaded, so it must be loaded here but only if it has not
# already been loaded.
if [ -f ~/.profile ]
then
    . ~/.profile
fi



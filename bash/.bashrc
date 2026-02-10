# ~/.bashrc

# BASHRC PREREQUISITES #####################################################
# Source the baseline bashrc first
if [ -f /etc/bashrc ]; then
	. /etc/bashrc
fi

# Define the platform
PLATFORM=`uname`
if [[ "$PLATFORM" == 'Linux' ]]
then
  # Check for WSL
  which wslinfo > /dev/null 2>&1
  if [[ $? -eq 0 ]]
  then
    PLATFORM="WSL"
  fi
elif [[ "$PLATFORM" == 'cygwin' ]] || [[ "$PLATFORM" == 'msys' ]] || [[ "$PLATFORM" == MING64* ]]
then
  # This is a "git bash" prompt, probably
  PLATFORM="GIT"
fi


# GLOBAL DEFS ##############################################################
## Turn off "zsh is default" warning on MacOS
if [[ "$PLATFORM" == 'Darwin' ]]
then
  export BASH_SILENCE_DEPRECATION_WARNING=1
fi

## Null
if [[ "$PLATFORM" == 'GIT' ]]
then
  NULL=NUL
else
  NULL=/dev/null
fi

# ALIASES ##################################################################
## cls
alias cls="clear"

## dir
alias dir="ls"

## grep
alias grep="grep --color=auto"

## ll
alias ll="ls -la"

## ls
if [[ "$PLATFORM" == 'Darwin' ]]
then
  alias ls='ls -G'
else
  alias ls='ls --color=auto'
fi

# RHEL PROMPT ##############################################################
if [[ -t 1 ]]
then
  # Only change prompt if we're in an interactive terminal
  export PS1="[\u@\h \[\033[38;5;6m\]\W\[$(tput sgr0)\]]\\$ "
fi

# CUSTOM FUNCTIONALITY #####################################################
## Git tab-completion
. ~/.bash_git.sh

## nvm initialization
if [[ -e ~/.nvm ]]
then
  source ~/.nvm/nvm.sh
fi

## rbenv initialization
which rbenv > $NULL 2>&1
if [[ $? -eq 0 ]]
then
  eval "$(rbenv init -)"
fi

## WSL mounted drive aliases
if [[ "$PLATFORM" == 'WSL' ]]
then
  for mnt_path in /mnt/*
  do
    mnt_name=$(basename $mnt_path)
    if ! [ -L "/$mnt_name" ]
    then
      echo "Setting up symlink from /$mnt_name/ to $mnt_path"
      ln -s $mnt_path /$mnt_name
    fi
  done
fi

# SOURCE PROFILE ###########################################################
# In interactive shells, .profile is not loaded, so it must be loaded here but only if it has not
# already been loaded.
if [ -f ~/.profile ]
then
    . ~/.profile
fi



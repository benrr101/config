# PATH OVERRIDES ###########################################################
PATH="$PATH:$PATH:$HOME/.local/bin"
PATH="$PATH:$HOME/bin"

## Add rbenv if it's installed
if [[ -d "$HOME/.rbenv/bin" ]]
then
    PATH="$HOME/.rbenv/bin:$PATH"
fi

export PATH

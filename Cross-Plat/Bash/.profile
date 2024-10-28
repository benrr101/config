# PATH OVERRIDES ###########################################################
PATH="$PATH:$PATH:$HOME/.local/bin"
PATH="$PATH:$HOME/bin"

## Add rbenv if it's installed
if [[ -d "$HOME/.rbenv/bin" ]]
then
    PATH="$HOME/.rbenv/bin:$PATH"
fi

## Add dornet if it's installed
if [[ -d "$HOME/.dotnet"]]
then
    PATH="$HOME/.dotnet:$HOME/.dotnet/tools:$PATH"
fi

export PATH

#!/bin/bash

# CONSTANTS ----------------------------------------------------------------
# Technically the state directory is in the local directory which may or may not be the root of the
# directory. Since we're supposed 
STATE_DIR=".git/recursive-rebase-state"


REFLIST_FILE="$STATE_DIR/reflist" # Contains all intermediate refs to rebase
STATE_FILE="$STATE_DIR/state"     # Contains:
                                  # 0) Ref to rebase onto in the current step (onto ref)
                                  # 1) Index of ref to rebase in current step
                                  # 2) Ref to start rebasing from in current step (divergent ref)


BRANCHES_FILE="$STATE_DIR/branches"
CURRENT_INDEX_FILE="$STATE_DIR/current_index"
TARGET_REF_FILE="$STATE_DIR/target_ref"

ORIGINAL_BRANCH_FILE="$STATE_DIR/original_branch"

# HELPER FUNCTIONS ---------------------------------------------------------
function continue_recursive_rebase {
	# ###########################################
	# Case 1: Starting from the beginning, we have these stored files
	# - reflist:
	#   - feat1 (0x123)
	#   - feat2 (0x234)
	#   - feat3 (0x345)
	# - state:
	#   - main
	#   - 0
	#   - main~ (0x456)
	# 
	# We set up our state to:
	# * local_start_ref <= state[2]                       = main~ (0x456)
	# * local_onto_ref  <= state[0]                       = main
	# ^^ before loop -- at beginning of loop vv
	# * i               <= state[1]                       = 0
	# * local_stop_ref  <= reflist[i] = reflist[0]        = feat1 (0x123)
	# * next_start_ref  <= git ref-parse $local_stop_ref  = feat1 (0x123)
	#
	# Then we run:
	# git rebase --onto $local_onto_ref $local_start_ref $local_stop_ref
	#
	# On success - update local state to:
	# * local_start_ref <= next_start_ref                = 0x123 (old feat1)
	# * local_onto_ref  <= local_start_ref               = feat1 (0xABC)
	# ^^ at end of loop -- at beginning of loop vv 
	# * i               <= i++ = 1 
	# * local_stop_ref  <= reflist[i] = reflist[1]       = feat2 (0x234)
	# * next_start_ref  <= git ref-parse $local_stop_ref = feat2 (0x234)
    #
    #
	# ###########################################
	# Case 2: Restoring from incomplete recursive rebase, we have these stored files
	# (it's basically the same as above, just +1)
	# - reflist:
	#   - feat1 (0xABC, updated b/c of rebase)
	#   - feat2 (0x234)
	#   - feat3 (0x345)
	# - state:
	#   - feat1 (0xABC)
	#   - 1
	#   - 0x123 (old feat1)
	#
	# We set up our state to:
	# * local_start_ref <= state[2] = 0x123 (old feat1)
	# * local_onto_ref  <= state[0] = feat1 (0xABC)
	#   ^^ before loop -- at beginning of loop vv
	# * i               <= state[1] = 1
	# * local_stop_ref  <= reflist[i] = reflist[1] = feat1 (0x123)
	# * 
	# 


    # Load the state from disk
    local current_index=$(load_branches_index)
    local local_onto_ref=$(load_onto_ref)
    local local_divergent_ref=$(load_divergent_ref)

    local branches
    mapfile -t branches < load_branches

    # Continue where we left off
    for ((i=current_index; i<${#branches[@]}; i++))
    do
    	# Read the next onto ref because it will go away when the branch is rebased
    	local next_onto=$(git rev-parse )


    done





	# Load the state from disk
	local current_index=$(load_branches_index)
	local target_branch=$(load_target_branch)
	local branches
	mapfile -t branches < load_branches

	# Continue from where we left off
	local prev_branch="$target_branch"

	for ((i=current_index; i<${#branches[@]}; i++))
	do
		local branch="$branches[$i]"

		# Determine the divergent ref for the current rebase operation
		if [[ $i -eq 0 ]]
		then

		else

		fi

		# Perform the rebase
		if ! perform_rebase "$prev_branch" "$branch" "$upstream_branch"
		then
			# Rebase failed, exit and let user resolve conflicts
			exit 1
		fi

		prev_branch="$branch"
	done




}

function get_branch_chain {
	local start_ref="$1"
	local end_ref="$2"

	# Get all commits between start_ref and end_ref
	local commits=$(git rev-list --reverse "${start_ref}..${end_ref}")

	# Find branches that point to these commits
	local branches=()
	local seen_commits=()

	while IFS= read -r commit
	do
		if [[ -n "$commit" ]]
		then
			# Find branches pointing to this commit
			local branch_refs
			branch_refs=$(
				git for-each-ref              \
				  --format='%(refname:short)' \
				  refs/heads/                 \
				  --points-at="$commit"       \
				|                             \
				grep -v '^HEAD$' || true      \
			)

			if [[ -n "$branch_refs" ]]
			then
				while IFS= read -r branch
				do
					if [[ -n "$branch" && ! " ${branches[*]} " =~ " ${branch} " ]]
					then
						branches+=("$branch")
						seen_commits+=("$commit")

						# Only take the first branch per commit
						break
					fi
				done <<< "$branch_refs"
			fi
		fi
	done <<< "$commits"

	# Always include the end branch if it's not already included
	if [[ ! " ${branches[*]} " =~ " ${end_ref} " ]]
	then
		branches+=($end_ref)
	fi

	printf "%s\n" ${branches[@]}
}

function load_branches {
	if [[ ! -f "$BRANCHES_FILE" ]]
	then
		log_error "No recursive rebase in progress - branches file missing"
		exit 1
	fi

	cat "$BRANCHES_FILE"
}

function load_branches_index {
	if [[ ! -f "$CURRENT_INDEX_FILE" ]]
	then
		log_error "No recursive rebase in progress - current index file missing"
		exit 1
	fi

	cat "$CURRENT_INDEX_FILE"
}

function load_original_branch {
	if [[ ! -f "$ORIGINAL_BRANCH_FILE" ]]
	then
		log_error "No recursive rebase in progress - original branch file missing"
		exit 1
	fi

	cat "$ORIGINAL_BRANCH_FILE"
}

function load_target_ref {
	if [[ ! -f "$TARGET_REF_FILE" ]]
	then
		log_error "No recursive rebase in progress - target ref file missing"
		exit 1
	fi

	cat "$TARGET_REF_FILE"
}

function log_error {
	echo -e "\033[0;31m[ERROR]\033[0m $1"
}

function log_info {
	echo -e "[INFO] $1"
}

function perform_rebase {
	local onto_ref="$1"
	local start_ref="$2"
	local end_ref="$3"

	log_info "Rebasing $start_ref to $end_ref onto $onto_ref"

	git rebase --onto "$onto_ref" "$start_ref" "$end_ref"
	if [[ $? -eq 0 ]]
	then
		log_info "Successfully rebased $end_ref"
		return 0
	else
		log_warning "Rebase conflicts detected for $end_ref"
		log_info "Resolve conflicts and run: git-recursive-rebase --continue"
		return 1
	fi
}

function save_branches {
	mkdir -p "$STATE_DIR"
	printf '%s\n' "${@}" > "$BRANCHES_FILE"
}

function save_branches_index {
	mkdir -p "$STATE_DIR"
	echo "$1" > "$CURRENT_INDEX_FILE"
}

function save_original_branch {
	mkdir -p "$STATE_DIR"
	echo "$1" > "$ORIGINAL_BRANCH_FILE"
}

function save_target_branch {
	mkdir -p "$STATE_DIR"
	echo "$1" > "$TARGET_BRANCH_FILE"
}

function show_usage {
	cat << EOF
Usage: git-recursive-rebase [OPTIONS]

Start a new recursive rebase:
    git-recursive-rebase --onto <target_ref> <start_ref> <end_ref>

    example:
    git-recursive-rebase --onto main divergent_commit_hash feature/my-feature

Continue after resolving conflicts:
    git-recursive-rebase --continue

Abort the recursive rebase:
    git-recursive-rebase --abort

Show this help message:
    git-recursive-rebase --help
    git-recursive-rebase -h
EOF
}

function start_recursive_rebase {
	local target_ref="$1"
	local start_ref="$2"
	local end_ref="$3"

	# Validate inputs
	if ! git rev-parse --verify "$target_ref" >/dev/null 2>&1
	then
		log_error "Target ref '$target_ref' does not exist"
		exit 1
	fi

	if ! git rev-parse --verify "$start_ref" >/dev/null 2>&1
	then
		log_error "Start ref '$start_ref' does not exist"
		exit 1
	fi

	if ! git rev-parse --verify "$end_ref" >/dev/null 2>&1
	then
		log_error "End ref '$end_ref' does not exist"
		exit 1
	fi

	# Check if there's already a rebase in progress
	if [[ - "$STATE_DIR" ]]
	then
		log_error "A recursive rebase is already in progress. Use --continue or --abort"
		exit 1
	fi

	# Get the branch chain
	log_info "Discovering branch chain from '$start_ref' to '$end_ref'..."
	local branches
	mapfile -t branches < <(get_branch_chain "$start_ref" "$end_ref")

	if [[ ${#branches[@]} -eq 0 ]]
	then
		log_error "No branches found in the specified range"
		exit 1
	fi

	log_info "Found branches: ${branches[*]}"

	# Save state
	save_branches "${branches[@]}"
	save_current_index 0
	save_original_branch "$(git branch --show-current)"
	save_target_branch "$target_branch"

	# Start the rebase process
	continue_recursive_rebase
}

# MAIN FUNCTION ------------------------------------------------------------

function main {
	# Make sure we're in a git repository
	if ! git rev-parse --git-dir >/dev/null 2>&1
	then
		log_error "FUCK7"
		exit 1
	fi

	# Check arguments to see what mode to run in
	case "${1:-}" in
		--help|-h)
			show_usage
			exit 0
			;;

		--continue)
			log_error "FUCK2"
			;;

		--abort)
			log_error "FUCK3"
			;;

		--onto)
			if [[ $# -ne 4 ]]
			then
				log_error "Invalid arguments for --onto"
				show_usage
				exit 1
			fi

			start_recursive_rebase "$2" "$3" "$4"
			;;
		
		"")
			log_error "No arguments provided"
			show_usage
			exit 1
			;;

		*)
			log_error "Unknown option: $1"
			show_usage
			exit 1;
			;;
	esac
}

main "$@"
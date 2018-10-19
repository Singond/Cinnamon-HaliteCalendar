install:
	rm -rf "${HOME}/.local/share/cinnamon/applets/halite-calendar@singon"
	cp -pr "halite-calendar@singon" "${HOME}/.local/share/cinnamon/applets"

clean:
	rm -rf "${HOME}/.local/share/cinnamon/applets/halite-calendar@singon"
	rm -rf "${HOME}/.cinnamon/configs/halite-calendar@singon"
